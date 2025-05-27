import { Component, ChangeDetectionStrategy, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

// Dummy roles for access control
const USER_ROLE = 'Analyst'; // Change to test different roles
const WRITE_ROLES = ['Analyst', 'IPA Specialist', 'SysDev Analyst'];
const READ_ROLES = ['PPG', 'PPG Manager', 'SSG', 'SSG Specialist', 'Viewer', 'Sys Admin'];

interface PatientCustomField {
  patId: string;
  editable: boolean;
  fieldName: string;
  fieldType: string;
  values: string;
  isNew?: boolean;
  isEditing?: boolean;
  selected?: boolean;
}

@Component({
  selector: 'app-patient-custom-fields',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './patient-custom-fields.component.html',
  styleUrls: ['./patient-custom-fields.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PatientCustomFieldsComponent implements OnInit {
  rows: PatientCustomField[] = [];
  apiData: any[] = [];
  patients: any[] = [];
  showPatients = false;

  // UI State
  filterFieldName = '';
  filterValues = '';
  sortField: 'fieldName' | 'fieldType' | null = null;
  sortAsc = true;
  selectedRowIndex: number | null = null;
  showHistory = false;
  history: any[] = [];
  lastChangedBy = '';
  lastChangedDate = '';
  loading = false;
  error = '';

  // Access control
  get canWrite() { return WRITE_ROLES.includes(USER_ROLE); }
  get canRead() { return READ_ROLES.includes(USER_ROLE) || this.canWrite; }

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {
    // this.fetchPatientCustomFields();
    this.fetchPatientCustomFields();
  }

  ngOnInit() {
    // debugger;
    // this.fetchPatientCustomFields();
  }

  fetchPatientCustomFields() {
    this.loading = true;
    this.error = '';
    this.http.get<any[]>('http://localhost:8081/api/patient-custom-fields').subscribe({
      next: (data) => {
        this.apiData = data;
        this.rows = data.map(item => ({
          patId: item.patId,
          editable: true,
          fieldName: item.name,
          fieldType: item.type,
          values: item.value,
        }));
        this.cdr.markForCheck();
        if (data.length > 0) {
          this.lastChangedBy = data[0].study?.changedBy || '';
          this.lastChangedDate = data[0].study?.changedDt || '';
        }
        this.history = [{ action: 'Fetched from API', by: this.lastChangedBy, date: this.lastChangedDate, details: '' }];
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to fetch data';
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
    // console.log('this.rows', this.rows);
  }

  // Add a new row (POST)
  addRow() {
    if (!this.canWrite) return;
    const newRow: any = {
      patId: 'PAT' + Math.floor(Math.random() * 10000),
      name: '',
      revisionId: 1,
      study: { studyId: 'STUDY001' },
      value: '',
      type: 'List',
      idSession: 1,
      editable: false,
      fieldName: '',
      fieldType: 'Date',
      values: '',
      isNew: true,
      isEditing: true
    };
    this.rows = [...this.rows, newRow];
  }

  // Save changes (POST for new, PUT for existing)
  saveRows() {
    if (!this.canWrite) return;
    const saveOps = this.rows.map(row => {
      if (row.isNew) {
        // POST with required format
        const body = {
          patId: row.patId,
          name: row.fieldName,
          revisionId: 1,
          study: { studyId: 'STUDY001' },
          value: row.values,
          type: row.fieldType === 'Date' ? 'DATE' : 'List',
          idSession: 1
        };
        return this.http.post('http://localhost:8081/api/patient-custom-fields', body).toPromise()
          .catch((err) => {
            alert('Error adding record: fieldname must be unique');
            throw err;
          });
      } else if (row.isEditing) {
        // PUT
        const body = {
          name: row.fieldName,
          revisionId: 2, // or track revision
          study: { studyId: 'STUDY001' },
          value: row.values,
          type: row.fieldType === 'Date' ? 'DATE' : 'List',
          idSession: 1
        };
        return this.http.put(`http://localhost:8081/api/patient-custom-fields/${row.patId}`, body).toPromise()
          .catch((err) => {
            alert('Error updating record: already mapped to a patient unable to update');
            throw err;
          });
      }
      return Promise.resolve();
    });
    Promise.all(saveOps).then(() => {
      this.addHistory('Saved changes');
      this.lastChangedBy = USER_ROLE;
      this.lastChangedDate = new Date().toLocaleString();
      this.fetchPatientCustomFields();
      this.cdr.markForCheck();
    }).catch(() => {
      this.error = 'Failed to save changes';
      this.cdr.markForCheck();
    });
  }

  // Edit a row (set isEditing)
  editRow(index: number) {
    if (!this.canWrite) return;
    this.rows = this.rows.map((row, i) => i === index ? { ...row, isEditing: true } : row);
    this.cdr.markForCheck();
  }

  // Delete selected row (DELETE)
  deleteRow() {
    if (!this.canWrite || this.selectedRowIndex === null) return;
    const patId = this.rows[this.selectedRowIndex].patId;
    this.http.delete(`http://localhost:8081/api/patient-custom-fields/${patId}`).subscribe({
      next: () => {
        this.rows = this.rows.filter((_, i) => i !== this.selectedRowIndex!);
        this.addHistory('Deleted row');
        this.lastChangedBy = USER_ROLE;
        this.lastChangedDate = new Date().toLocaleString();
        this.selectedRowIndex = null;
        this.fetchPatientCustomFields();
        this.cdr.markForCheck();
      },
      error: () => {
        this.error = 'Failed to delete row';
        this.cdr.markForCheck();
        alert('Failed to delete row: already mapped to a patient unable to delete');
      }
    });
  }

  // Cancel edits (revert to last saved)
  cancelEdit() {
    this.rows = this.rows.map(row => ({ ...row, isEditing: false, isNew: false }));
  }

  // Export to Excel
  exportToExcel() {
    // Prepare header and meta info
    const studyIdentifier = 'APECS Study Identifier: 7559/0001';
    const protocolNum = 'Protocol Num: BGB-3245-EGFR-001';
    const exportedBy = 'Exported By: bot_MogulriP_003';
    const exportedOn = 'Exported On: ' + new Date().toLocaleString() + ' (GMT)';

    // Prepare data rows
    const dataRows = this.rows.map(row => ({
      'Enable Editing': row.editable ? 'Y' : 'N',
      'Field Name': row.fieldName,
      'Field Type': row.fieldType,
      'List of values': row.values || 'null'
    }));

    // Build worksheet data
    const wsData: any[][] = [
      [studyIdentifier],
      [protocolNum],
      [],
      [exportedBy],
      [exportedOn],
      [],
      ['Enable Editing', 'Field Name', 'Field Type', 'List of values'],
      ...dataRows.map(row => [row['Enable Editing'], row['Field Name'], row['Field Type'], row['List of values']])
    ];

    // Create worksheet and workbook
    const ws: XLSX.WorkSheet = XLSX.utils.aoa_to_sheet(wsData);
    const wb: XLSX.WorkBook = { Sheets: { 'Patient_Custom_Fields': ws }, SheetNames: ['Patient_Custom_Fields'] };

    // Write and trigger download
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `Patient_Custom_Fields_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  // Show history modal
  openHistory() {
    this.http.get<any[]>('http://localhost:8081/api/patient-custom-field-history').subscribe({
      next: (data) => {
        this.history = data.map(item => ({
          action: item.action,
          changedField: item.changedField,
          oldValue: item.oldValue,
          newValue: item.newValue,
          modifiedBy: item.modifiedBy,
          modifiedTs: Array.isArray(item.modifiedTs) ? this.formatDateArray(item.modifiedTs) : item.modifiedTs
        }));
        this.showHistory = true;
        this.cdr.markForCheck();
      },
      error: () => {
        this.history = [];
        this.showHistory = true;
        this.cdr.markForCheck();
      }
    });
  }

  formatDateArray(arr: number[]): string {
    if (!arr || arr.length < 6) return '';
    // arr: [YYYY, MM, DD, HH, mm, ss, ...]
    const [year, month, day, hour, min, sec] = arr;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }

  closeHistory() {
    this.showHistory = false;
  }

  // Refresh (stub)
  refresh() {
    alert('Refresh triggered (stub)');
    this.addHistory('Refreshed data');
  }

  // Filtering
  get filteredRows() {
    let rows = this.rows;
    if (this.filterFieldName) {
      rows = rows.filter(r => r.fieldName.toLowerCase().includes(this.filterFieldName.toLowerCase()));
    }
    if (this.filterValues) {
      rows = rows.filter(r => r.values.toLowerCase().includes(this.filterValues.toLowerCase()));
    }
    if (this.sortField) {
      rows = [...rows].sort((a, b) => {
        const aVal = a[this.sortField!].toLowerCase();
        const bVal = b[this.sortField!].toLowerCase();
        return this.sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      });
    }
    return rows;
  }

  // Sorting
  sortBy(field: 'fieldName' | 'fieldType') {
    if (this.sortField === field) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortField = field;
      this.sortAsc = true;
    }
  }

  // Enable editing toggle
  toggleEditable(index: number) {
    if (!this.canWrite) return;
    this.rows = this.rows.map((row, i) => i === index ? { ...row, editable: !row.editable } : row);
  }

  // Validation (basic)
  validateRow(row: PatientCustomField): string | null {
    if (!row.fieldName.trim()) return 'Field Name is required.';
    if (row.fieldName.length > 100) return 'Field Name must be <= 100 characters.';
    if (!row.fieldType) return 'Field Type is required.';
    if (row.fieldType === 'List' && !row.values.trim()) return 'List of values required for List type.';
    return null;
  }

  // Add to history
  addHistory(action: string) {
    this.history.unshift({ action, by: USER_ROLE, date: new Date().toLocaleString(), details: '' });
  }

  selectRow(index: number) {
    this.selectedRowIndex = index;
  }

  openPatients() {
    this.http.get<any[]>('http://localhost:8081/api/patients').subscribe({
      next: (data) => {
        this.patients = data;
        this.showPatients = true;
        this.cdr.markForCheck();
      },
      error: () => {
        this.patients = [];
        this.showPatients = true;
        this.cdr.markForCheck();
      }
    });
  }

  closePatients() {
    this.showPatients = false;
  }
}
