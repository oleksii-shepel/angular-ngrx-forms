import { Action, ActionReducer, createSelector } from '@ngrx/store';
import { Deferred, FormActions, FormActionsInternal } from './actions';
import { Queue } from './queue';
import { deepClone, difference, getValue, setValue } from './utils';



export interface FormCast<T> {
  value: T;
  errors?: Record<string, string>;
  dirty?: boolean;
  status?: string;
  submitted?: boolean;
}



export const selectFormCast = (slice: string) => createSelector((state: any) => getValue(state, slice), state => state);
export const selectValue = (slice: string) => createSelector(selectFormCast(slice), state => state?.value);
export const selectErrors = (slice: string) => createSelector(selectFormCast(slice), state => state?.errors);
export const selectDirty = (slice: string) => createSelector(selectFormCast(slice), state => state?.dirty);
export const selectStatus = (slice: string) => createSelector(selectFormCast(slice), state => state?.status);
export const selectSubmitted = (slice: string) => createSelector(selectFormCast(slice), state => state?.submitted);



export const propValue = 'value';
export const propErrors = 'errors';
export const propDirty = 'dirty';
export const propStatus = 'status';
export const propSubmitted = 'submitted';



export const actionQueues = new Map<string, Queue<Action>>();



export const forms = (initialState: any = {}) => (reducer: ActionReducer<any>): any => {

  const metaReducer = (state: any, action: any) => {

    state = state ?? deepClone(initialState);
    let nextState = state;
    const slice = action?.path;

    if(slice) {

      if(!actionQueues.has(slice) || action.deferred) {

        nextState = reducer(state, action);
        let feature = getValue(nextState, slice);

        switch(action.type) {
          case FormActions.UpdateForm:
            feature = setValue(feature, propValue, action.value);
            break;
          case FormActions.UpdateField:
            feature = setValue(feature,`${propValue}.${action.property}`, action.value);
            break;
          case FormActions.ResetForm:
            break;
          case FormActionsInternal.UpdateStatus:
            feature = setValue(feature, propStatus, action.status);
            break;
          case FormActionsInternal.UpdateErrors:
            feature = setValue(feature, propErrors, deepClone(action.errors));
            break;
          case FormActionsInternal.UpdateDirty:
            feature = setValue(feature, propDirty, action.dirty);
            break;
          case FormActionsInternal.AutoInit:
            feature = setValue(feature, propValue, action.value);
            break;
          case FormActionsInternal.AutoSubmit:
            feature = setValue(feature, propSubmitted, true);
            break;
          case FormActionsInternal.FormDestroyed:
            break;
        }

        nextState = setValue(nextState, slice, feature)
        return nextState;
      } else {
        const queue = actionQueues.get(slice) as Queue<Action>;
        const type = queue.peek()?.type;

        if(!queue.initialized$.value) {
         if(action.type === FormActionsInternal.AutoInit && type !== FormActionsInternal.AutoInit) {
            queue.shift(new Deferred(action));
            queue.initialized$.next(true);
            return nextState;
          } else if (type === FormActionsInternal.AutoInit) {
            queue.first(new Deferred(action));
            queue.initialized$.next(true);
            return nextState;
          } else {
            queue.enqueue(new Deferred(action));
            return nextState;
          }
        } else {
          queue.enqueue(new Deferred(action));
          return nextState;
        }
      }
    }

    nextState = reducer(state, action);
    return nextState;
  }

  return metaReducer;
}

export const logger = (settings: {showAll?: boolean, showRegular?: boolean, showDeferred?: boolean, showOnlyModifiers?: boolean}) => (reducer: ActionReducer<any>): any => {
  settings = Object.assign({showAll: false, showRegular: false, showDeferred: false, showOnlyModifiers: true}, settings);

  function filter(action: any, difference: any): boolean {
    let show = false;
    if(settings.showRegular && !action.deferred) {
      show = true;
    }
    if(settings.showDeferred && action.deferred) {
      show = true;
    }
    if(settings.showOnlyModifiers && Object.keys(difference).length > 0) {
      show = true;
    }
    if(settings.showAll) {
      show = true;
    }
    return show;
  }

  return (state: any, action: any) => {
    const result = reducer(state, action);
    const actionCopy = deepClone(action);
    delete actionCopy.type;

    const actionPath = actionCopy?.path ?? '';
    delete actionCopy?.path;

    const previous = actionPath.length > 0 ? getValue(state, actionPath) : state;
    const current = actionPath.length > 0 ? getValue(result, actionPath) : result;
    const diff = difference(previous, current);

    if(filter(action, diff)) {
      console.groupCollapsed("%c%s%c", action.deferred ? "color: blue;" : "color: black;", action.type, "color: black;");
      console.log("path: '%c%s%c', payload: %o", "color: red;", actionPath, "color: black;", actionCopy);
      console.log('added: %o, removed: %o, changed: %o', diff.added || {}, diff.removed || {}, diff.changed || {});
      console.groupEnd();
    }
    return result;
  };
}
