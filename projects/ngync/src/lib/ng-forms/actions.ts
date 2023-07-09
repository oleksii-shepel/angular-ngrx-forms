import { Action, createAction, props } from '@ngrx/store';

export enum FormActions {
  UpdateForm = '@forms/update',
  UpdateField = '@forms/field/update',
  ResetForm = '@forms/reset',
}

export enum FormActionsInternal {
  UpdateStatus = '@forms/internal/status/update',
  UpdateDirty = '@forms/internal/dirty/update',
  UpdateErrors = '@forms/internal/errors/update',
  AutoInit = '@forms/internal/init',
  AutoSubmit = '@forms/internal/submit',
  FormDestroyed = '@forms/internal/destroyed',
}

export const UpdateForm = createAction(
  FormActions.UpdateForm,
  props<{ path: string; value: any; }>()
);

export const UpdateField = createAction(
  FormActions.UpdateField,
  props<{ path: string; property: string; value: any; }>()
);

export const ResetForm = createAction(
  FormActions.ResetForm,
  props<{ path: string; state: 'initial' | 'submitted' | 'blank'}>()
);

export const UpdateStatus = createAction(
  FormActionsInternal.UpdateStatus,
  props<{ path: string; status: string; }>()
);

export const UpdateDirty = createAction(
  FormActionsInternal.UpdateDirty,
  props<{ path: string; dirty: boolean; }>()
);

export const UpdateErrors = createAction(
  FormActionsInternal.UpdateErrors,
  props<{ path: string; errors: Record<string, string>; }>()
);

export const AutoInit = createAction(
  FormActionsInternal.AutoInit,
  props<{ path: string; value: any; }>()
);

export const AutoSubmit = createAction(
  FormActionsInternal.AutoSubmit,
  props<{ path: string; }>()
);

export const FormDestroyed = createAction(
  FormActionsInternal.FormDestroyed,
  props<{ path: string; }>()
);

export class Deferred implements Action {
  type!: string;
  deferred = true;

  constructor(action: Action) {
    Object.assign(this, action);
  }
}
