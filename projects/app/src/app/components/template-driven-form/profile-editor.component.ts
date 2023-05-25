import { Component, OnDestroy, ViewChild, ChangeDetectionStrategy } from '@angular/core';
import { NgForm } from '@angular/forms';
import { initialHero } from '../../models/profile';
import { Store } from '@ngrx/store';
import { HeroState } from '../../reducers/hero.reducer';
import { ApplicationState } from '../../reducers';
import { take, Observable } from 'rxjs';
import { FormSubmitted, InitForm, UpdateFormValue, deepClone, getSlice, getValue } from 'ngync';

@Component({
  selector: 'template-profile-editor',
  templateUrl: './profile-editor.component.html',
  styleUrls: ['./profile-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TemplateProfileEditorComponent implements OnDestroy {
  @ViewChild('heroForm') form: NgForm | null = null;

  slice = "hero";
  profile$!: Observable<HeroState>;
  model = initialHero;
  a: any;

  constructor(private store: Store<ApplicationState>) {

    this.a = this.store.select(getSlice(this.slice)).pipe(take(1)).subscribe((state) => {
      let model = getValue(state, "model") ?? initialHero;
      this.store.dispatch(new InitForm({ path: this.slice, value: model}));
      this.model = deepClone(model);
    });

    this.profile$ = this.store.select(getSlice(this.slice));
  }

  updateProfile() {
    this.store.dispatch(new UpdateFormValue({value: {
      firstName: 'Nancy',
      address: {
        street: '123 Drew Street'
      }
    }, path: "hero"}));
  }

  addAlias() {
    this.model.aliases.push('');
    this.store.dispatch(new UpdateFormValue({value: this.model, path: "hero"}));
  }

  trackById(index: number, obj: string): any {
    return index;
  }

  onSubmit() {
    if(this.form?.valid) {
      this.store.dispatch(new FormSubmitted({path: "hero"}));
      alert("Form submitted successfully");
    }
  }

  ngOnDestroy() {
    this.a.unsubscribe();
  }
}
