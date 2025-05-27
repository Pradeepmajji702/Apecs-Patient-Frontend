import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Routes } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PatientCustomFieldsComponent } from './patient-custom-fields.component';

const routes: Routes = [
  { path: '', component: PatientCustomFieldsComponent }
];

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    RouterModule.forChild(routes),
    PatientCustomFieldsComponent
  ]
})
export class PatientCustomFieldsModule { }
