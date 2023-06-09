import { Directive, Input, OnInit, Provider, forwardRef } from '@angular/core';
import { ControlContainer } from "@angular/forms";
import { NgModelArray } from "ngync";

const formControlBinding: Provider = {
  provide: ControlContainer,
  useExisting: forwardRef(() => FieldArrayDirective),
};

@Directive({
  selector: '[ngFieldArray]',
  providers: [
    formControlBinding,
  ],
  exportAs: 'ngFieldArray',
})
export class FieldArrayDirective extends NgModelArray implements OnInit {
  @Input('ngFieldArray') override name: string = '';

  override ngOnInit() {
    super.ngOnInit();
  }
}
