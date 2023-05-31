import {
  AfterViewInit,
  ChangeDetectorRef,
  Directive,
  ElementRef,
  Inject,
  Injector,
  Input,
  OnDestroy,
  OnInit,
  Optional,
  Self
} from '@angular/core';
import { FormControlStatus, FormGroupDirective, NgForm } from '@angular/forms';
import { Store } from '@ngrx/store';
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  delayWhen,
  filter,
  first,
  map,
  repeat,
  takeWhile,
  tap
} from 'rxjs';
import {
  DomObserver,
  NGYNC_CONFIG_DEFAULT,
  NGYNC_CONFIG_TOKEN,
  checkForm,
  deepEqual,
  getSlice,
  getSubmitted,
  setValue
} from '.';
import {
  ResetForm,
  UpdateDirty,
  UpdateErrors,
  UpdateStatus,
  UpdateSubmitted,
  UpdateValue
} from './actions';

@Directive({
  selector:
    'form:not([ngNoForm]):not([formGroup])[ngync],ng-form[ngync],[ngForm][ngync],[formGroup][ngync]',
  exportAs: 'ngync',
})
export class SyncDirective implements OnInit, OnDestroy, AfterViewInit {
  @Input('ngync') slice!: string;

  debounce!: number;
  clearOnDestroy!: boolean;
  updateOn!: string;

  dir: NgForm | FormGroupDirective;

  _initialState: any;
  _submittedState: any;

  _unmounted$ = new BehaviorSubject<boolean>(false);
  _blur$ = new BehaviorSubject<boolean>(false);
  _submitted$ = new BehaviorSubject<boolean>(false);
  _input$ = new BehaviorSubject<boolean>(false);
  _updating$ = new BehaviorSubject<boolean>(false);

  _initialized = false;

  _subs = {} as any;

  _blurCallback = () => this._blur$.next(true);
  _inputCallback = () => {
    this._input$.next(true);
  };

  constructor(
    @Optional() @Self() @Inject(ChangeDetectorRef) public cdr: ChangeDetectorRef,
    @Optional() @Self() @Inject(ElementRef) public elRef: ElementRef<any>,
    @Inject(Injector) public injector: Injector,
    @Inject(Store) public store: Store
  ) {

    this.dir = injector.get(FormGroupDirective, null) ?? (injector.get(NgForm, null) as any);
    let config = injector.get<any>(NGYNC_CONFIG_TOKEN, NGYNC_CONFIG_DEFAULT);

    this.debounce = config.debounce;
    this.clearOnDestroy = config.clearOnDestroy;
    this.updateOn = config.updateOn;
  }

  ngOnInit() {
    if (!this.slice) {
      throw new Error('Misuse of this directive');
    }

    if (!this.dir) {
      throw new Error('Supported form control directive not found');
    }

    let _selector = getSubmitted(this.slice);
    this._subs.a = this.store.select(_selector).pipe(
      filter(() => this._initialized),
      delayWhen(() => this._updating$),
      takeWhile(() => DomObserver.mounted(this.elRef.nativeElement)),
      map((state) => !!state),
      tap((state) => { _selector.release(); this._submitted$.next(state); })
    ).subscribe();

    this._subs.b = combineLatest([this._input$, this._blur$, this._submitted$, this._updating$]).pipe(
      debounceTime(this.debounce),
      filter(([input, blur, submitted, updating]) => !updating && (input || blur || submitted)),
      filter(() => this._initialized),
      takeWhile(() => DomObserver.mounted(this.elRef.nativeElement)),
      tap(() => { this._updating$.next(true) }),
      tap(([input, blur, submitted]) => {
        let form = this.formValue;
        let equal = true;

        if(submitted === true) {
          this.dir.form.markAsPristine();
          this.dir.form.updateValueAndValidity();
          this.cdr.markForCheck();

          this._submittedState = {
            model: form,
            errors: this.dir.errors,
            dirty: !equal,
            status: this.dir.status,
            submitted: true,
          };
        } else {
          equal = deepEqual(form, this._submittedState?.model);

          if (equal && ((this.updateOn === 'change' && input === true) || (this.updateOn === 'blur' && blur === true))) {
            this.dir.form.markAsPristine();
            this.dir.form.updateValueAndValidity();
            this.cdr.markForCheck();
          }
        }

        if (submitted === true || (this.updateOn === 'change' && input === true || this.updateOn === 'blur' && blur === true)) {

          if(submitted === false) {
            this.store.dispatch(UpdateSubmitted({ path: this.slice, value: !input }));
          }

          this.store.dispatch(UpdateValue({ path: this.slice, value: form }));
          this.store.dispatch(UpdateDirty({ path: this.slice, dirty: input }));
          this.store.dispatch(UpdateErrors({ path: this.slice, errors: this.dir.errors }));
          this.store.dispatch(UpdateStatus({ path: this.slice, status: this.dir.status }));

          this.dir.form.updateValueAndValidity();
          this.cdr.markForCheck();
        }
      }),
      tap(([ input, blur, submitted, _]) => {

        if(input === true) {
          this._input$.next(false);
        }

        if(blur === true) {
          this._blur$.next(false);
        }

        if(submitted === true) {
          this._submitted$.next(false);
        }

        this._updating$.next(false);

      })
    ).subscribe();

    this._subs.c = this.store
      .select(getSlice(this.slice))
      .pipe(
        first(),
        filter((state) => state?.model),
        repeat({ count: 10, delay: 0 }),
        tap((state) => this.dir.form.patchValue(state.model)),
        filter((state) => checkForm(this.dir.form, state.model)),
        takeWhile(() => DomObserver.mounted(this.elRef.nativeElement)),
        takeWhile(() => !this._initialized),
        delayWhen(() => this._updating$)
      )
    .subscribe((state) => {
      this._updating$.next(true);

      this._initialized = true;
      this.dir.form.markAsPristine();
      this.cdr.markForCheck();
      this._initialState = state;

      if (this.dir instanceof NgForm) {
        this.setEventListeners();
      }

      this._updating$.next(false);
    });

    this._subs.d = DomObserver.children(this.elRef.nativeElement).subscribe(() => {
      this.setEventListeners();
    });
  }

  ngAfterViewInit() {
    if (this.dir instanceof FormGroupDirective) {
      this.setEventListeners();
    }
  }

  ngOnDestroy() {
    if (this.clearOnDestroy) {
      this.store.dispatch(ResetForm({ value: {}, path: this.slice }));
    }

    for (const element of this.nativeElements) {
      element.removeEventListener('blur', this._blurCallback);
      element.removeEventListener('input', this._inputCallback);
    }

    for (const sub of Object.keys(this._subs)) {
      this._subs[sub].unsubscribe();
    }

    this._blur$.complete();
    this._input$.complete();
    this._submitted$.complete();
  }

  ngOnComponentUnmounted() {
    this._unmounted$.next(true);
    this._unmounted$.complete();
  }

  setEventListeners() {
    for (const element of this.nativeElements) {
      element.addEventListener('input', this._inputCallback);
      element.addEventListener('blur', this._blurCallback);
    }
  }

  get nativeElements() {
    let directives: any =
      this.dir instanceof FormGroupDirective
        ? this.dir.directives
        : (this.dir as any)._directives;
    return {
      [Symbol.iterator]: function* () {
        for (const directive of directives) {
          let nativeElement =
            directive.valueAccessor?._elementRef?.nativeElement;
          if (nativeElement) {
            yield nativeElement;
          }
        }
      },
    };
  }

  get formValue(): any {
    let directives: any =
      this.dir instanceof FormGroupDirective
        ? this.dir.directives
        : (this.dir as any)._directives;
    let value = {} as any;
    for (const directive of directives) {
      let native = directive.valueAccessor?._elementRef?.nativeElement;
      if (native) {
        value = setValue(value, directive.path.join('.'), native.value);
      }
    }
    return value;
  }

  get formStatus(): FormControlStatus {
    this.dir.form.updateValueAndValidity({ onlySelf: true, emitEvent: false });
    return this.dir.form.status;
  }
}
