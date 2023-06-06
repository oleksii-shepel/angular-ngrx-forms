import { createFeatureSelector, createSelector } from '@ngrx/store';
import { FormActions, FormActionsInternal } from './actions';
import { deepClone, prop, setValue } from './utils';



export interface FormState {
  model: any;
  errors?: { [k: string]: string };
  dirty?: boolean;
  status?: string;
  submitted?: boolean;
}



export const getSlice = (slice: string) => createFeatureSelector<FormState>(slice);
export const getModel = (slice: string) => createSelector(getSlice(slice), state => state?.model);
export const getErrors = (slice: string) => createSelector(getSlice(slice), state => state?.errors);
export const getDirty = (slice: string) => createSelector(getSlice(slice), state => state?.dirty);
export const getStatus = (slice: string) => createSelector(getSlice(slice), state => state?.status);
export const getSubmitted = (slice: string) => createSelector(getSlice(slice), state => state?.submitted);



export const forms = (initialState: any = {}) => (reducer: Function) => {
  return (state: any, action: any) => {
    state = state ?? initialState;
    let nextState = reducer(state, action);
    let path = action?.path;

    if(!path) {
      return nextState;
    }

    if (action.type === FormActions.InitForm) {
      nextState = setValue(state, path, { model: deepClone(action.value) } as FormState);
    }

    if (action.type === FormActions.UpdateValue) {
      nextState = setValue(state, `${path}.${prop<FormState>(x => x.model)}`, deepClone(action.value));
    }

    if (action.type === FormActions.UpdateSubmitted) {
      nextState = setValue(state, `${path}.${prop<FormState>(x => x.submitted)}`, action.value);
    }

    if (action.type === FormActionsInternal.ResetForm) {
      nextState = setValue(state, path, { model: deepClone(action.value) } as FormState);
    }

    if (action.type === FormActionsInternal.UpdateStatus) {
      nextState = setValue(state, `${path}.${prop<FormState>(x => x.status)}`, action.status);
    }

    if (action.type === FormActionsInternal.UpdateErrors) {
      nextState = setValue(state, `${path}.${prop<FormState>(x => x.errors)}`, deepClone(action.errors));
    }

    if (action.type === FormActionsInternal.UpdateDirty) {
      nextState = setValue(state, `${path}.${prop<FormState>(x => x.dirty)}`, action.dirty);
    }

    if (action.type === FormActionsInternal.AutoInit) {
      nextState = setValue(state, path, { model: deepClone(action.value) } as FormState);
    }

    if (action.type === FormActionsInternal.AutoSubmit) {
      nextState = setValue(state, `${path}.${prop<FormState>(x => x.submitted)}`, true);
    }

    return nextState;
  }
}



export const logger = (settings: any = {}) => (reducer: Function) => {
  return (state: any, action: any) => {
    const result = reducer(state, action);
    console.groupCollapsed(action.type);
    console.log('state before', state);
    console.log('action', action);
    console.log('state after', result);
    console.groupEnd();
    return result;
  };
}
