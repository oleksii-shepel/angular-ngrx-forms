import {
  AfterContentInit,
  ChangeDetectorRef,
  ContentChildren,
  Directive,
  ElementRef,
  Inject,
  Injector,
  Input,
  OnDestroy,
  OnInit,
  Optional,
  QueryList,
  Self
} from '@angular/core';
import { FormControlStatus, FormGroupDirective, NgControl, NgForm } from '@angular/forms';
import { Action, ActionsSubject, Store } from '@ngrx/store';
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  delayWhen,
  filter,
  fromEvent,
  map,
  repeat,
  sampleTime,
  startWith,
  take,
  takeWhile,
  tap,
  withLatestFrom
} from 'rxjs';
import {
  DomObserver,
  NGYNC_CONFIG_DEFAULT,
  NGYNC_CONFIG_TOKEN,
  checkForm,
  deepEqual,
  getModel,
  getSlice,
  getSubmitted,
  setValue
} from '.';
import {
  AutoInit,
  AutoSubmit,
  FormActions,
  ResetForm,
  UpdateDirty,
  UpdateErrors,
  UpdateStatus,
  UpdateSubmitted,
  UpdateValue
} from './actions';


export interface NgyncConfig {
  debounce?: number;
  resetOnDestroy?: 'no-changes' | 'initial' | 'submitted' | 'empty';
  updateOn?: 'change' | 'blur' | 'submit';
  autoSubmit?: boolean;
}


@Directive({
  selector:
    'form:not([ngNoForm]):not([formGroup])[ngync],ng-form[ngync],[ngForm][ngync],[formGroup][ngync]',
  exportAs: 'ngync',
})
export class SyncDirective implements OnInit, OnDestroy, AfterContentInit {
  @Input('ngync') slice!: string;
  @ContentChildren(NgControl, {descendants: true}) controls!: QueryList<NgControl>;

  debounce!: number;
  resetOnDestroy!: string;
  updateOn!: string;
  autoSubmit!: boolean;

  dir: NgForm | FormGroupDirective;

  _initialState: any;
  _submittedState: any;

  _unmounted$ = new BehaviorSubject<boolean>(false);
  _blur$ = new BehaviorSubject<boolean>(false);
  _input$ = new BehaviorSubject<boolean>(false);
  _submitted$ = new BehaviorSubject<boolean>(false);
  _updating$ = new BehaviorSubject<boolean>(false);

  _initialized = false;
  _initDispatched = false;

  _subs = {} as any;

  _blurCallback = (control: NgControl) => (value : any) => {
    this._blur$.next(true);
  };

  _inputCallback = (control: NgControl) => (value : any) => {
    control.control!.setValue(value);
    this._input$.next(true)
  };

  onInitOrUpdate$!: Observable<any>;
  onSubmit$!: Observable<any>;
  onAutoSubmit$!: Observable<any>;
  onChange$!: Observable<any>;
  onAutoInit$!: Observable<any>;
  onControlsChanges$!: Observable<any>;

  constructor(
    @Optional() @Self() @Inject(ChangeDetectorRef) public cdr: ChangeDetectorRef,
    @Optional() @Self() @Inject(ElementRef) public elRef: ElementRef,
    @Inject(Injector) public injector: Injector,
    @Inject(Store) public store: Store,
    public actionsSubject: ActionsSubject
  ) {

    this.dir = injector.get(FormGroupDirective, null) ?? (injector.get(NgForm, null) as any);
    let config = injector.get<any>(NGYNC_CONFIG_TOKEN, {});

    this.debounce = config.debounce ?? NGYNC_CONFIG_DEFAULT.debounce;
    this.resetOnDestroy = config.resetOnDestroy ?? NGYNC_CONFIG_DEFAULT.resetOnDestroy;
    this.updateOn = config.updateOn ?? NGYNC_CONFIG_DEFAULT.updateOn;
    this.autoSubmit = config.autoSubmit ?? NGYNC_CONFIG_DEFAULT.autoSubmit;
  }

  ngOnInit() {
    if (!this.slice) {
      throw new Error('Misuse of sync directive');
    }

    if (!this.dir) {
      throw new Error('Supported form control directive not found');
    }

    this.onInitOrUpdate$ = this.actionsSubject.pipe(
      withLatestFrom(this.store.select(getModel(this.slice))),
      tap(([action, ]) => { if(action.type === FormActions.InitForm) { this._initDispatched = true; }}),
      filter(([action, ]) => action.type === FormActions.InitForm || action.type === FormActions.UpdateValue),
      takeWhile(() => DomObserver.mounted(this.elRef.nativeElement)),
      delayWhen(() => this._updating$),
      tap(([action, state]: [Action, any]) => {

        this._updating$.next(true);

        if(action.type === FormActions.InitForm) {
          this._initialState = state;
          this._initialized = true;
        }

        let formValue = this.formValue;
        Object.assign(formValue, state);

        this.dir.form.patchValue(formValue);
        this.dir.form.updateValueAndValidity();
        this.cdr.markForCheck();

        this._updating$.next(false);
      })
    );

    this.onSubmit$ = this.store.select(getSubmitted(this.slice)).pipe(
      filter(() => this._initialized),
      delayWhen(() => this._updating$),
      takeWhile(() => DomObserver.mounted(this.elRef.nativeElement)),
      map((state: any) => !!state),
      tap((state: boolean) => { getSubmitted(this.slice).release(); this._submitted$.next(state); })
    );

    let submit = this.elRef.nativeElement.querySelector('button[type="submit"],input[type="submit"]')
    this.onAutoSubmit$ = fromEvent(submit, 'click').pipe(
      filter(() => this._initialized),
      delayWhen(() => this._updating$),
      takeWhile(() => DomObserver.mounted(this.elRef.nativeElement)),
      filter(() => this.dir.form.valid),
      tap(() => this.store.dispatch(AutoSubmit({ path: this.slice }))),
      tap(() => this._submitted$.next(true))
    );

    this.onChange$ = combineLatest([this._input$, this._blur$, this._submitted$, this._updating$]).pipe(
      filter(([input, blur, submitted, updating]) => !updating && (input || blur || submitted)),
      filter(() => this._initialized),
      takeWhile(() => DomObserver.mounted(this.elRef.nativeElement)),
      delayWhen(() => this._updating$),
      sampleTime(this.debounce),
      tap(() => this._updating$.next(true)),
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
      tap(([input, blur, submitted, _]) => {

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
    );

    this.onAutoInit$ = this.store.select(getSlice(this.slice)).pipe(
      take(1),
      repeat({ count: 10 }),
      tap((state) => { if(state?.model) { this.dir.form.patchValue(state.model); }}),
      filter((state) => {return (state?.model) ? checkForm(this.dir.form, state.model): true;}),
      takeWhile(() => DomObserver.mounted(this.elRef.nativeElement)),
      filter(() => !this._initDispatched && !this._initialized),
      delayWhen(() => this._updating$),
      tap((state) => {
        this._updating$.next(true);
        if(state?.model || this.initialized) {
          this._initialized = true;

          this.dir.form.markAsPristine();
          this.cdr.markForCheck();

          let formValue = state?.model ?? this.formValue;
          this.store.dispatch(AutoInit({path: this.slice, value: formValue}));

          this._initialState = formValue;
        }
        this._updating$.next(false);
      })
    );
  }

  ngAfterContentInit() {
    this.onControlsChanges$ = this.controls.changes.pipe(
      startWith(this.controls),
      sampleTime(this.debounce),
      tap((controls) => {
        controls.forEach((control: NgControl) => {
          if(control.valueAccessor) {
            control.valueAccessor.registerOnChange(this._inputCallback(control));
            control.valueAccessor.registerOnTouched(this._blurCallback(control));
          }
        });
      })
    );

    let timeout = setTimeout(() => {
      this.subscribe();
      clearTimeout(timeout);
    }, 0);
  }

  ngOnDestroy() {
    if (this.resetOnDestroy !== 'no-changes') {
      switch(this.resetOnDestroy) {
        case 'initial':
          this.store.dispatch(ResetForm({ path: this.slice, value: this._initialState || {} }));
          break;
        case 'submitted':
          this.store.dispatch(ResetForm({ path: this.slice, value: this._submittedState || {} }));
          break;
        case 'empty':
          this.store.dispatch(ResetForm({ path: this.slice, value: {} }));
          break;
      }
    }

    for (const sub of Object.keys(this._subs)) {
      this._subs[sub].unsubscribe();
    }

    this._unmounted$.complete();
    this._blur$.complete();
    this._input$.complete();
    this._submitted$.complete();
    this._updating$.complete();
  }

  ngOnComponentUnmounted() {
    this._unmounted$.next(true);
    this._unmounted$.complete();
  }

  subscribe() {
    this._subs.a = this.onInitOrUpdate$.subscribe();
    this._subs.b = this.onSubmit$.subscribe();

    if(this.autoSubmit) {
      this._subs.c = this.onAutoSubmit$.subscribe();
    }

    this._subs.d = this.onChange$.subscribe();
    this._subs.e = this.onAutoInit$.subscribe();

    this._subs.f = this.onControlsChanges$.subscribe();
  }

  get initialized(): boolean {
    if(!this.controls) { return false; }

    let value = true;
    for (const control of this.controls.toArray()) {
      if(typeof control.value === 'undefined' || control.value === null) {
        value = false;
        break;
      }
    }
    return value;
  }

  get formValue(): any {
    if(!this.controls) { return {}; }

    let value = {};
    for (const control of this.controls.toArray()) {
      value = setValue(value, control.path!.join('.'), control.value);
    }
    return value;
  }

  get formStatus(): FormControlStatus {
    this.dir.form.updateValueAndValidity({ onlySelf: true, emitEvent: false });
    return this.dir.form.status;
  }
}
