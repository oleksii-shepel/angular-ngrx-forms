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
  asyncScheduler,
  defer,
  distinctUntilChanged,
  filter,
  finalize,
  from,
  fromEvent,
  map,
  mergeMap,
  observeOn,
  of,
  sampleTime,
  scan,
  startWith,
  switchMap,
  take,
  takeWhile,
  tap
} from 'rxjs';
import {
  NYGMA_CONFIG_DEFAULT,
  NYGMA_CONFIG_TOKEN,
  deepEqual,
  getValue,
  selectValue,
  setValue
} from '.';
import {
  AutoInit,
  AutoSubmit,
  Deferred,
  FormActions,
  FormActionsInternal,
  FormDestroyed,
  UpdateDirty,
  UpdateErrors,
  UpdateField,
  UpdateForm,
  UpdateStatus
} from './actions';
import { Queue } from './queue';
import { actionQueues } from './reducers';


export interface NygmaConfig {
  slice: string;
  debounceTime?: number;
  enableQueue?: boolean;
  updateOn?: 'change' | 'blur' | 'submit';
}


@Directive({
  selector:
    `form:not([ngNoForm]):not([formGroup])[nygma],ng-form[nygma],[ngForm][nygma],[formGroup][nygma]`,
  exportAs: 'nygma',
})
export class SyncDirective implements OnInit, OnDestroy, AfterContentInit {
  @Input('nygma') config!: string | NygmaConfig;
  @ContentChildren(NgControl, {descendants: true}) controls!: QueryList<NgControl>;

  split!: string;
  debounceTime!: number;
  enableQueue!: boolean;
  updateOn!: string;

  dir!: NgForm | FormGroupDirective;

  initialState: any = undefined;
  submittedState: any = undefined;
  destoyed = false;

  initialized$ = new BehaviorSubject<boolean>(false);

  subs = {} as any;

  blurCallback = (control: NgControl) => (value: any) => {
    if(this.updateOn === 'blur' && control.path) {
      this.store.dispatch(UpdateField({ split: `${this.split}::${control.path.join('.')}`, value: control.value }));
    }
  }

  inputCallback = (control: NgControl) => (value : any) => {
    if(this.updateOn === 'change' && control.path) {
      this.store.dispatch(UpdateField({ split: `${this.split}::${control.path.join('.')}`, value: value }));
    }
  }

  onInitOrUpdate$!: Observable<any>;
  onControlsChanges$!: Observable<any>;
  onSubmit$!: Observable<any>;
  onReset$!: Observable<any>;
  onStatusChanges$!: Observable<any>;
  onActionQueued$!: Observable<any>;
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

    let config = this.injector.get<any>(NYGMA_CONFIG_TOKEN, {});
    config = Object.assign(NYGMA_CONFIG_DEFAULT, config);

    if(typeof this.config === 'string') {
      this.split = this.config;
    } else {
      config = Object.assign(config, this.config);
      this.split = config.slice;
    }

    this.enableQueue = config.enableQueue;
    this.debounceTime = config.debounceTime;
    this.updateOn = config.updateOn;

    if (!this.split) {
      throw new Error('Misuse of sync directive');
    }

    if (!this.dir) {
      throw new Error('Supported form control directive not found');
    }

    if(this.enableQueue) {
      actionQueues.set(this.split, new Queue());
    }

    this.onSubmit$ = fromEvent(this.elRef.nativeElement, 'submit').pipe(
      filter(() => this.dir.form.valid),
      mergeMap((value) => from(this.initialized$).pipe(filter(value => value), take(1), map(() => value))),
      tap(() => {

        if(this.updateOn === 'submit') {
          this.store.dispatch(UpdateForm({split: this.split, value: this.formValue}));
        }

        this.submittedState = this.formValue;

        if (this.dir.form.dirty) {
          this.dir.form.markAsPristine();
          this.cdr.markForCheck();
        }
      }),
      tap(() => ( this.store.dispatch(AutoSubmit({ split: this.split })))),
      takeWhile(() => !this.destoyed)
    );

    this.onUpdateField$ = this.actionsSubject.pipe(
      filter((action: any) => action && action.split?.startsWith(this.split) && action.type === FormActions.UpdateField),
      sampleTime(this.debounceTime),
      mergeMap((value) => from(this.initialized$).pipe(filter(value => value), take(1), map(() => value))),
      tap((action: any) => {
        const state = this.submittedState ?? this.initialState;
        const savedState = getValue(state, action.property);

        const path = action.property.split('.');
        const control = path.reduce((acc: any, key: string, index: number) => acc[key], this.dir.form.controls);
        control.setValue(action.value, { emitEvent: false });

        const dirty = this.dir.form.dirty;

        !(savedState === control.value) ? control.markAsDirty() : control.markAsPristine();

        if(this.dir.form.dirty !== dirty) {
          this.store.dispatch(UpdateDirty({ split: this.split, dirty: this.dir.form.dirty }));
        }

        control.updateValueAndValidity();
        this.cdr.markForCheck();
      }),
      takeWhile(() => !this.destoyed)
    );

    this.onInitOrUpdate$ = this.actionsSubject.pipe(
      filter((action: any) => action && action.split === this.split && [FormActions.UpdateForm, FormActions.UpdateForm, FormActionsInternal.AutoInit].includes(action.type)),
      filter((action: any) => (!this.enableQueue || action.deferred)),
      tap((action) => {

        this.dir.form.patchValue(action?.value, {emitEvent: false});

        const initialized = this.initialized$.value;
        const dirty = !initialized ? false : !deepEqual(action?.value, this.submittedState ?? this.initialState);

        if(!initialized) {
          this.initialState = action?.value;
          this.initialized$.next(true);
        }

        if(this.dir.form.dirty !== dirty || !initialized) {
          dirty ? this.dir.form.markAsDirty() : this.dir.form.markAsPristine();
          this.store.dispatch(UpdateDirty({ split: this.split, dirty: dirty }));
        }

        this.dir.form.updateValueAndValidity();
        this.cdr.markForCheck();
      }),
      takeWhile(() => !this.destoyed)
    );

    this.onControlsChanges$ = defer(() => this.controls.changes.pipe(startWith(this.controls))).pipe(
      switchMap(() => from(this.store.select(selectValue(this.split))).pipe(take(1))),
      map((value) => value ? value : this.formValue),
      tap(() => {
        this.controls.forEach((control: NgControl) => {
          if(control.valueAccessor) {
            control.valueAccessor.registerOnChange(this.inputCallback(control));
            control.valueAccessor.registerOnTouched(this.blurCallback(control));
          }
        });
      }),
      tap(value => { if(!this.initialized$.value) { this.store.dispatch(AutoInit({ split: this.split, value: value })); } }),
      scan((acc, _) => acc + 1, 0),
      tap((value) => { if (value > 1) { this.store.dispatch(UpdateForm({ split: this.split, value: this.formValue })); } }),
      takeWhile(() => !this.destoyed),
    );

    this.onReset$ = this.actionsSubject.pipe(
      filter((action: any) => action && action.split === this.split && action.type === FormActions.ResetForm),
      filter((action) => (!this.enableQueue || action.deferred)),
      mergeMap((value) => from(this.initialized$).pipe(filter(value => value), take(1), map(() => value))),
      tap((action: any) => {
        if(action.state){
          switch(action.state) {
            case 'initial':
              this.store.dispatch(UpdateForm({ split: this.split, value: this.initialState || {} }));
              break;
            case 'submitted':
              this.store.dispatch(UpdateForm({ split: this.split, value: this.submittedState || {} }));
              break;
            case 'blank':
              this.store.dispatch(UpdateForm({ split: this.split, value: this.reset()}));
              break;
          }
        }
      }),
      takeWhile(() => !this.destoyed));

    this.onStatusChanges$ = this.dir.form.statusChanges.pipe(
      filter(() => this.initialized$.value),
      map((value) => ({ status: value as any, errors: this.dir.form.errors as any})),
      distinctUntilChanged((a, b) => a.status === b.status && deepEqual(a.errors, b.errors)),
      tap((value) => {
        if(value.status !== 'PENDING') {
          this.store.dispatch(UpdateStatus({ split: this.split, status: value.status }));
          this.store.dispatch(UpdateErrors({ split: this.split, errors: value.errors }));
        }
      }),
      takeWhile(() => !this.destoyed),
    );

    this.onActionQueued$ = of(this.enableQueue).pipe(
      filter((value) => value),
      switchMap(() => actionQueues.get(this.split)?.updated$ || of(null)),
      filter((value) => value !== null),
      observeOn(asyncScheduler),
      tap((queue) => {
        if(queue.initialized$.value) {
          while(queue.length > 0) {
            this.store.dispatch(queue.dequeue());
          }
        }
      }),
      takeWhile(() => document.contains(this.elRef.nativeElement)),
      finalize(() => {
        const queue = actionQueues.get(this.split) as Queue<Action>;
        if(queue.initialized$.value) {
          while(queue.length > 0) {
            this.store.dispatch(queue.dequeue() as Action);
          }
          this.store.dispatch(new Deferred(FormDestroyed({ split: this.split })));
        }
        actionQueues.delete(this.split);
      }),
    );
  }

  ngAfterContentInit() {
    this.subs.a = this.onActionQueued$.subscribe();
    this.subs.b = this.onStatusChanges$.subscribe();
    this.subs.c = this.onUpdateField$.subscribe();
    this.subs.d = this.onInitOrUpdate$.subscribe();
    this.subs.e = this.onSubmit$.subscribe();
    this.subs.f = this.onReset$.subscribe();
    this.subs.g = this.onControlsChanges$.subscribe();
  }

  ngOnDestroy() {
    if(!this.enableQueue) {
      this.store.dispatch(FormDestroyed({ split: this.split }));
    }

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