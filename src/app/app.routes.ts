import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'patient-custom-fields', pathMatch: 'full' },
  {
    path: 'patient-custom-fields',
    loadChildren: () => import('./patient-custom-fields/patient-custom-fields.module').then(m => m.PatientCustomFieldsModule)
  }
];
