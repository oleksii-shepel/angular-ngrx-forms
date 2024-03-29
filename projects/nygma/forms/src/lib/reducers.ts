import { ActionReducer, createSelector } from '@ngrx/store';
import { FormActionsInternal, actionMapping, actionQueues, deferred } from './actions';
import { Queue } from './queue';
import { deepClone, deepEqual, getValue, setValue } from './utils';

export type FormState = any;

export const selectFormState = (path: string, nocheck?: boolean) => createSelector((state: any) => {
  const form = deepClone(getValue(state, path));
  if(!form?.__form) { !nocheck && console.warn(`You are trying to read form state from the store by path '${path}', but it is not marked as such. Is the sync directive at this point in time initialized? Consider putting your code in a ngAfterViewInit hook`); }
  else { delete form?.__form; }
  return form;
}, state => state);

export const forms = (initialState: any = {}, logging: {showAll?: boolean, showRegular?: boolean, showDeferred?: boolean, showOnlyModifiers?: boolean, showMatch?: RegExp} = {}) => (reducer: ActionReducer<any>): any => {

  const metaReducer = (state: any, action: any) => {
    state = state ?? deepClone(initialState);

    let nextState = state;
    const slice = action.path;

    if(slice && actionMapping.has(action.type)) {
      const formAction = action;
      const queue = actionQueues.get(slice) ?? actionQueues.set(slice, new Queue()).get(slice);

      if(queue?.initialized$.value || formAction.type === FormActionsInternal.AutoInit) {
        const form = getValue(state, slice);
        nextState = setValue(state, slice, formAction.execute(form));
        logger(logging)(state, nextState, formAction);

        if(queue) {
          if(formAction.type === FormActionsInternal.AutoInit) {
            queue.initialized$.next(true);
            queue.initialized$.complete();
          } else if(formAction.type === FormActionsInternal.FormDestroyed) {
            actionQueues.delete(slice);
          }
        }
      }

      if (queue?.initialized$.value) {

        while(queue.length > 0) {
          const form = getValue(nextState, slice);
          const deferred = queue.dequeue();
          nextState = setValue(nextState, slice, deferred?.execute(form));
          logger(logging)(state, nextState, deferred);
        }
      } else if(queue) {
        queue.enqueue(deferred(formAction));
      }

      return nextState;
    }

    nextState = reducer(state, action);
    logger(logging)(state, nextState, action);
    return nextState;
  }
  return metaReducer;
}

export const logger = (settings: {showAll?: boolean, showRegular?: boolean, showDeferred?: boolean, showOnlyModifiers?: boolean, showMatch?: RegExp}) => (state: any, nextState: any, action: any) => {
  settings = Object.assign({showAll: false, showRegular: false, showDeferred: false, showOnlyModifiers: true}, settings);

  function filter(action: any, equal: any): boolean {
    let show = false;
    if(settings.showMatch && action.type.match(settings.showMatch)) {
      show = true;
    }
    if(settings.showRegular && !action.deferred) {
      show = true;
    }
    if(settings.showDeferred && action.deferred) {
      show = true;
    }
    if(settings.showOnlyModifiers && !equal) {
      show = true;
    }
    if(settings.showAll) {
      show = true;
    }
    return show;
  }

  const actionCopy = deepClone(action);
  delete actionCopy.type;

  const actionPath = actionCopy?.path ?? '';
  delete actionCopy?.path;

  const before = actionPath.length > 0 ? selectFormState(actionPath, true)(state) : state;
  const after = actionPath.length > 0 ? selectFormState(actionPath, true)(nextState) : nextState;
  const equal = deepEqual(before, after);

  if(filter(action, equal)) {
    console.groupCollapsed("%c%s%c", action.deferred ? "color: blue;" : "color: black;", action.type, "color: black;");
    console.log("path: '%c%s%c', payload: %o", "color: red;", actionPath, "color: black;", actionCopy);
    console.log(after);
    console.groupEnd();
  }
  return nextState;
}
