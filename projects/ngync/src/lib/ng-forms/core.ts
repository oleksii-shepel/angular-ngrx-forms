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
import { ActionsSubject, Store } from '@ngrx/store';
import {
  BehaviorSubject,
  Observable,
  defer,
  distinctUntilChanged,
  filter,
  from,
  fromEvent,
  map,
  mergeMap,
  sampleTime,
  scan,
  startWith,
  switchMap,
  take,
  takeWhile,
  tap
} from 'rxjs';
import {
  NGYNC_CONFIG_DEFAULT,
  NGYNC_CONFIG_TOKEN,
  deepEqual,
  getValue,
  selectValue,
  setValue
} from '.';
import {
  AutoInit,
  AutoSubmit,
  FormActions,
  FormActionsInternal,
  FormDestroyed,
  UpdateDirty,
  UpdateErrors,
  UpdateField,
  UpdateForm,
  UpdateStatus
} from './actions';
import { selectDirty } from './reducers';


export interface NgyncConfig {
  slice: string;
  debounceTime?: number;
  enableQueue?: boolean;
  updateOn?: 'change' | 'blur' | 'submit';
}


@Directive({
  selector:
    `form:not([ngNoForm]):not([formGroup])[ngync],ng-form[ngync],[ngForm][ngync],[formGroup][ngync]`,
  exportAs: 'ngync',
})
export class SyncDirective implements OnInit, OnDestroy, AfterContentInit {
  @Input('ngync') config!: string | NgyncConfig;
  @ContentChildren(NgControl, {descendants: true}) controls!: QueryList<NgControl>;

  slice!: string;
  debounceTime!: number;
  updateOn!: string;

  dir!: NgForm | FormGroupDirective;

  initialState: any = undefined;
  submittedState: any = undefined;
  destoyed = false;

  initialized$ = new BehaviorSubject<boolean>(false);

  subs = {} as any;

  blurCallback = (control: NgControl) => (value: any) => {
    if(this.updateOn === 'blur' && control.path) {
      this.store.dispatch(UpdateField({ path: this.slice, property: control.path.join('.'), value: control.value }));
    }
  }

  inputCallback = (control: NgControl) => (value : any) => {
    if(control.value !== value && control.control) {
      control.control.setValue(value);

      const state = this.submittedState ?? this.initialState;
      const savedState = control.path ? getValue(state, control.path.join('.')) : undefined;
      !(savedState === control.value) ? control.control.markAsDirty() : control.control.markAsPristine();
    }
    if(this.updateOn === 'change' && control.path) {
      this.store.dispatch(UpdateField({ path: this.slice, property: control.path.join('.'), value: value }));
    }
  }

  onInitOrUpdate$!: Observable<any>;
  onControlsChanges$!: Observable<any>;
  onSubmit$!: Observable<any>;
  onReset$!: Observable<any>;
  onStatusChanges$!: Observable<any>;
  onUpdateField$!: Observable<any>;

  constructor(
    @Optional() @Self() @Inject(ChangeDetectorRef) public cdr: ChangeDetectorRef,
    @Optional() @Self() @Inject(ElementRef) public elRef: ElementRef,
    @Inject(Injector) public injector: Injector,
    @Inject(Store) public store: Store,
    @Inject(ActionsSubject) public actionsSubject: ActionsSubject,
  ) {
  }

  ngOnInit() {
    this.dir = this.injector.get(FormGroupDirective, null) ?? (this.injector.get(NgForm, null) as any);

    let config = this.injector.get<any>(NGYNC_CONFIG_TOKEN, {});
    config = Object.assign(NGYNC_CONFIG_DEFAULT, config);

    if(typeof this.config === 'string') {
      this.slice = this.config;
    } else {
      config = Object.assign(config, this.config);
      this.slice = config.slice;
    }

    this.debounceTime = config.debounceTime;
    this.updateOn = config.updateOn;

    if (!this.slice) {
      throw new Error('Misuse of sync directive');
    }

    if (!this.dir) {
      throw new Error('Supported form control directive not found');
    }

    this.onSubmit$ = fromEvent(this.elRef.nativeElement, 'submit').pipe(
      filter(() => this.dir.form.valid),
      mergeMap((value) => from(this.initialized$).pipe(filter(value => value), take(1), map(() => value))),
      tap(() => {

        this.submittedState = this.formValue;

        if(this.updateOn === 'submit') {
          this.store.dispatch(UpdateForm({path: this.slice, value: this.formValue}));
        }
      }),
      tap(() => ( this.store.dispatch(AutoSubmit({ path: this.slice })))),
      takeWhile(() => !this.destoyed)
    );

    this.onUpdateField$ = this.actionsSubject.pipe(
      filter((action: any) => action && action.path === this.slice && action.type === FormActions.UpdateField),
      sampleTime(this.debounceTime),
      mergeMap((value) => from(this.initialized$).pipe(filter(value => value), take(1), map(() => value))),
      mergeMap(() => this.store.select(selectDirty(this.slice)).pipe(take(1), map((dirty) => dirty))),
      tap((dirty) => {

        const notEqual = !deepEqual(this.formValue, this.submittedState ?? this.initialState);

        if(dirty !== notEqual) {
          notEqual ? this.dir.form.markAsDirty() : this.dir.form.markAsPristine();
          this.store.dispatch(UpdateDirty({ path: this.slice, dirty: notEqual }));
        }
      }),
      takeWhile(() => !this.destoyed)
    );

    this.onInitOrUpdate$ = this.actionsSubject.pipe(
      filter((action: any) => action && action.path === this.slice && [FormActions.UpdateForm, FormActionsInternal.AutoInit].includes(action.type)),
      tap((action) => {

        this.dir.form.patchValue(action.value, {emitEvent: false});

        const initialized = this.initialized$.value;
        const dirty = !initialized ? false : !deepEqual(action.value, this.submittedState ?? this.initialState);

        if(!initialized) {
          this.initialState = action.value;
          this.initialized$.next(true);
        }

        if(this.dir.form.dirty !== dirty || !initialized) {
          dirty ? this.dir.form.markAsDirty() : this.dir.form.markAsPristine();
          this.store.dispatch(UpdateDirty({ path: this.slice, dirty: dirty }));
        }

        this.dir.form.updateValueAndValidity();
        this.cdr.markForCheck();
      }),
      takeWhile(() => !this.destoyed)
    );

    this.onControlsChanges$ = defer(() => this.controls.changes.pipe(startWith(this.controls))).pipe(
      switchMap(() => from(this.store.select(selectValue(this.slice))).pipe(take(1))),
      map((value) => value ? value : this.formValue),
      tap(() => {
        this.controls.forEach((control: NgControl) => {
          if(control.valueAccessor) {
            control.valueAccessor.registerOnChange(this.inputCallback(control));
            control.valueAccessor.registerOnTouched(this.blurCallback(control));
          }
        });
      }),
      tap(value => { if(!this.initialized$.value) { this.store.dispatch(AutoInit({ path: this.slice, value: value })); } }),
      scan((acc, _) => acc + 1, 0),
      tap((value) => { if (value > 1) { this.store.dispatch(UpdateForm({ path: this.slice, value: this.formValue })); } }),
      takeWhile(() => !this.destoyed),
    );

    this.onReset$ = this.actionsSubject.pipe(
      filter((action: any) => action && action.path === this.slice && action.type === FormActions.ResetForm),
      mergeMap((value) => from(this.initialized$).pipe(filter(value => value), take(1), map(() => value))),
      tap((action: any) => {
        if(action.state){
          switch(action.state) {
            case 'initial':
              this.store.dispatch(UpdateForm({ path: this.slice, value: this.initialState || {} }));
              break;
            case 'submitted':
              this.store.dispatch(UpdateForm({ path: this.slice, value: this.submittedState || {} }));
              break;
            case 'blank':
              this.store.dispatch(UpdateForm({ path: this.slice, value: this.reset()}));
              break;
          }
        }
      }),
      takeWhile(() => !this.destoyed));

    this.onStatusChanges$ = this.dir.form.statusChanges.pipe(
      mergeMap((value) => from(this.initialized$).pipe(filter(value => value), take(1), map(() => value))),
      map((value) => ({ status: value as any, errors: this.dir.form.errors as any})),
      distinctUntilChanged((a, b) => a.status === b.status && deepEqual(a.errors, b.errors)),
      tap((value) => {
        if(value.status !== 'PENDING') {
          this.store.dispatch(UpdateStatus({ path: this.slice, status: value.status }));
          this.store.dispatch(UpdateErrors({ path: this.slice, errors: value.errors }));
        }
      }),
      takeWhile(() => !this.destoyed),
    );
  }

  ngAfterContentInit() {
    this.subs.a = this.onStatusChanges$.subscribe();
    this.subs.b = this.onUpdateField$.subscribe();
    this.subs.c = this.onInitOrUpdate$.subscribe();
    this.subs.d = this.onSubmit$.subscribe();
    this.subs.e = this.onReset$.subscribe();
    this.subs.f = this.onControlsChanges$.subscribe();
  }

  ngOnDestroy() {
    this.store.dispatch(FormDestroyed({ path: this.slice }));

    for (const sub of Object.keys(this.subs)) {
      this.subs[sub].unsubscribe();
    }

    this.initialized$.complete();

    this.destoyed = true;
  }

  get activeControl(): NgControl | undefined {
    const activeElement = document.activeElement;
    if(activeElement) {
      return this.controls.find((control: NgControl) => {
        return (control.valueAccessor as any)?._elementRef?.nativeElement === activeElement;
      });
    } else {
      return undefined;
    }
  }

  get formValue(): any {
    if(!this.controls) { return {}; }

    let value = {};
    for (const control of this.controls.toArray()) {
      if(control.path) {
        value = setValue(value, control.path.join('.'), control.value);
      }
    }
    return value;
  }

  get formStatus(): FormControlStatus {
    return this.dir.form.status;
  }

  reset(): any {
    if(!this.controls) { return {}; }

    let value = {};
    for (const control of this.controls.toArray()) {
      control.reset((control.valueAccessor as any)?._elementRef?.nativeElement.defaultValue);

      if(control.path) {
        value = setValue(value, control.path.join('.'), control.value);
      }
    }

    return value;
  }
}
