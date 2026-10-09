import { Component, inject, OnInit, signal, computed, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { LeadTelecallingService, LeadItem, CallActivityItem } from '../../core/services/lead-telecalling.service';
import { UserManagementService } from '../../core/services/user-management.service';
import { AuthService } from '../../core/services/auth.service';
import { CampaignService } from '../../core/services/campaign.service';
import * as XLSX from '@e965/xlsx';
import { firstValueFrom } from 'rxjs';
import { isLeadAssignedToUser } from '../telecalling/telecalling.component';
import { FIXED_PACKAGES, isItemForPackage, resolveProductContext } from '../../core/models/package.model';
import { PackageService } from '../../core/services/package.service';
import { LeadsToolbarComponent } from './components/leads-toolbar/leads-toolbar.component';
import { LeadsTableComponent } from './components/leads-table/leads-table.component';
import { TelecallingMonitorComponent } from './components/telecalling-monitor/telecalling-monitor.component';
import { AddLeadModalComponent } from './components/modals/add-lead-modal/add-lead-modal.component';
import { AssignLeadModalComponent } from './components/modals/assign-lead-modal/assign-lead-modal.component';
import { EditLeadModalComponent } from './components/modals/edit-lead-modal/edit-lead-modal.component';
import { LeadDetailsModalComponent } from './components/modals/lead-details-modal/lead-details-modal.component';

@Component({
  selector: 'app-leads',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    LeadsToolbarComponent,
    LeadsTableComponent,
    TelecallingMonitorComponent,
    AddLeadModalComponent,
    AssignLeadModalComponent,
    EditLeadModalComponent,
    LeadDetailsModalComponent,
  ],
  templateUrl: './leads.component.html',
  styleUrl: './leads.component.scss',
})
export class LeadsComponent implements OnInit {
  readonly packageFilterSignal = signal<string | undefined>(undefined);
  @Input() set packageFilter(val: string | undefined) {
    this.packageFilterSignal.set(val);
  }
  get packageFilter(): string | undefined {
    return this.packageFilterSignal();
  }

  readonly productFilterSignal = signal<string | undefined>(undefined);
  @Input() set productFilter(val: string | undefined) {
    this.productFilterSignal.set(val);
  }
  get productFilter(): string | undefined {
    return this.productFilterSignal();
  }

  @Input() embedded = false;

  readonly Math = Math;
  readonly leadService = inject(LeadTelecallingService);
  readonly userMgmtService = inject(UserManagementService);
  readonly authService = inject(AuthService);
  readonly campaignService = inject(CampaignService);
  readonly packageService = inject(PackageService);

  readonly activeTab = signal<'LEADS_LIST' | 'TELECALLING_MONITOR'>('LEADS_LIST');
  readonly showModal = signal<boolean>(false);
  readonly isUploadingLeads = signal<boolean>(false);
  readonly leadUploadStatus = signal<string | null>(null);
  readonly leadUploadError = signal<string | null>(null);
  readonly filterStatus = signal<string>('ALL');
  readonly searchQuery = signal<string>('');
  readonly filterTelecaller = signal<string>('ALL');
  readonly filterCampaign = signal<string>('ALL');
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(10);
  readonly pageSizeOptions: number[] = [10, 25, 50, 100];

  
  newFirstName = '';
  newLastName = '';
  newEmail = '';
  newPhone = '';
  newSource = 'Digital Ads Lead Form';
  newCampaignId = '';
  newCampaignName = '';
  newAssignedTelecallerId = '';
  readonly isCreatingLead = signal<boolean>(false);

  firstNameTouched = false;
  lastNameTouched = false;
  emailTouched = false;
  phoneTouched = false;
  sourceTouched = false;


  selectedLeadForAssign: LeadItem | null = null;
  selectedUserId = '';
  assigneeName = '';
  readonly canCreateLeads = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return false;
    const role = user.role ? String(user.role).toUpperCase() : '';
    return (
      role.includes('DIGITAL') ||
      role.includes('MARKETING') ||
      role.includes('ADMIN')
    );
  });

  readonly isTelecaller = computed(() => {
    const user = this.authService.currentUser();
    return user?.role === 'TELECALLER';
  });


  readonly activeTelecallers = computed(() => {
    const list: any[] = [];
    const seen = new Set<string>();

    const users = this.userMgmtService.users().filter((u) => u.role === 'TELECALLER');
    users.forEach((u) => {
      const key = (u.fullName || '').toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        list.push(u);
      }
    });


    this.leadService.leads().forEach((l) => {
      const aName = (l.assigneeName || (l as any).assignee_name || '').trim();
      const aId = String(l.assignedTo || (l as any).assigned_to || '').trim();
      if (aName && aName.toLowerCase() !== 'unassigned' && !seen.has(aName.toLowerCase())) {
        seen.add(aName.toLowerCase());
        list.push({
          id: aId || aName,
          fullName: aName,
          email: '',
          role: 'TELECALLER',
          isActive: true,
        });
      }
    });

    return list;
  });

  readonly realUsersList = computed(() => this.activeTelecallers());


  readonly availableCampaigns = computed(() => {
    const list: { id: string; name: string }[] = [];
    const seenNames = new Set<string>();

    const all = this.campaignService.campaigns();
    if (all && all.length > 0) {
      all.forEach((c) => {
        const name = (c.name || '').trim();
        if (name && !seenNames.has(name.toLowerCase())) {
          seenNames.add(name.toLowerCase());
          list.push({ id: String(c.id || name), name });
        }
      });
    }


    const allLeads = this.leadService.leads();
    allLeads.forEach((l) => {
      const name = (l.campaignName || (l as any).campaign_name || '').trim();
      if (name && !seenNames.has(name.toLowerCase())) {
        seenNames.add(name.toLowerCase());
        list.push({ id: String(l.campaignId || (l as any).campaign_id || name), name });
      }
    });

    return list;
  });

  isPhoneValid(phone: string): boolean {
    if (!phone || !phone.trim()) return false;
    const clean = phone.replace(/[\s\-\(\)\+]/g, '');
    if (clean.length === 10 && /^[6-9]\d{9}$/.test(clean)) return true;
    if (clean.length === 12 && clean.startsWith('91') && /^[6-9]\d{9}$/.test(clean.substring(2))) return true;
    if (clean.length === 11 && clean.startsWith('0') && /^[6-9]\d{9}$/.test(clean.substring(1))) return true;
    return false;
  }

  isEmailValid(email: string): boolean {
    if (!email || !email.trim()) return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
  }

  get isAddLeadFormValid(): boolean {
    return (
      this.newFirstName.trim().length >= 2 &&
      this.newLastName.trim().length >= 1 &&
      this.isPhoneValid(this.newPhone) &&
      this.isEmailValid(this.newEmail) &&
      this.newSource.trim().length >= 2
    );
  }

  getSelectedTelecaller() {
    if (!this.newAssignedTelecallerId) return null;
    return this.activeTelecallers().find((tc) => tc.id === this.newAssignedTelecallerId) || null;
  }

  onCampaignSelectChange(event: Event) {
    const selectedVal = (event.target as HTMLSelectElement).value;
    const found = this.campaignService.campaigns().find((c) => c.id === selectedVal);
    if (found) {
      this.newCampaignId = found.id;
      this.newCampaignName = found.name;
    } else {
      this.newCampaignId = '';
      this.newCampaignName = selectedVal;
    }
  }

  onTelecallerSelectChange(event: Event) {
    const selectedId = (event.target as HTMLSelectElement).value;
    this.newAssignedTelecallerId = selectedId;
  }

  ngOnInit() {
    this.leadService.loadLeads().subscribe();
    this.leadService.loadCalls().subscribe();
    this.leadService.loadSummary().subscribe();
    this.campaignService.loadCampaigns().subscribe();
    this.packageService.loadPackages().subscribe();
  }

  async onLeadsFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.leadUploadStatus.set(null);
    this.leadUploadError.set(null);
    if (!file) return;

    if (!this.canCreateLeads()) {
      this.leadUploadError.set('Only Digital Marketing and Admin roles can upload leads.');
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !['xlsx', 'xls', 'csv'].includes(extension)) {
      this.leadUploadError.set('Choose an Excel (.xlsx or .xls) or CSV file.');
      return;
    }

    this.isUploadingLeads.set(true);
    try {
      const inputData = extension === 'csv' ? await file.text() : await file.arrayBuffer();
      const workbook = XLSX.read(inputData, { type: extension === 'csv' ? 'string' : 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) throw new Error('The selected file has no worksheets or data.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
        defval: '',
        raw: false,
      });
      const leads: Partial<LeadItem>[] = rows
        .filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''))
        .map((row, index) => {
          const fields = new Map<string, string>(
            Object.entries(row).map(([header, value]) => [
              header.trim().toLowerCase().replace(/[\s_-]+/g, ''),
              String(value ?? '').trim(),
            ])
          );
          const get = (...names: string[]): string => {
            for (const name of names) {
              const value = fields.get(name);
              if (value) return value;
            }
            return '';
          };
          const fullName = get('leadname', 'fullname', 'name');
          const splitName = fullName.split(/\s+/).filter(Boolean);
          const firstName = get('firstname') || splitName.shift() || '';
          const lastName = get('lastname') || splitName.join(' ');
          const contactInfo = get('contactinfo', 'contact');
          const contactEmail = contactInfo.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
          const contactPhone = contactInfo
            .replace(contactEmail, '')
            .replace(/(?:phone|mobile|tel)\s*[:=-]?\s*/i, '')
            .trim();
          const phone = get('phone', 'phonenumber', 'mobile', 'mobilenumber', 'contactnumber') || contactPhone;
          const email = get('email', 'emailaddress') || contactEmail;

          if (!firstName || !phone) {
            throw new Error(`Row ${index + 2}: name and phone number are required.`);
          }

          return {
            firstName,
            lastName,
            email,
            phone,
            source: get('source', 'leadsource') || 'Excel Upload',
            campaignName: get('campaign', 'campaignname') || undefined,
          };
        });

      if (leads.length === 0) {
        throw new Error('The spreadsheet contains no lead rows. Include a name and phone number for each lead.');
      }

      const user = this.authService.currentUser();
      if (!user) throw new Error('Your user session could not be verified. Please sign in again.');
      const campaigns = this.availableCampaigns();
      const campaign = campaigns[0];
      const campaignName = this.packageFilterSignal()?.trim() || campaign?.name || 'Excel Lead Upload';
      for (const lead of leads) {
        const rowCampaignName = lead.campaignName?.trim();
        if (rowCampaignName) {
          const matchedCampaign = campaigns.find(
            (available) => available.name.toLowerCase() === rowCampaignName.toLowerCase()
          );
          if (matchedCampaign) lead.campaignId = matchedCampaign.id;
        } else {
          lead.campaignName = campaignName;
          lead.campaignId = campaign?.id || 'cmp_default';
        }
      }
      const response = await firstValueFrom(this.leadService.importLeadBatch({
        leads,
        campaignId: campaign?.id || 'cmp_default',
        campaignName,
        source: 'Excel Upload',
        creatorId: user.id,
        creatorEmail: user.email,
        creatorName: user.fullName,
        uploaderRole: user.role,
      }));

      this.resetFilters();
      const distribution = response.allocationSummary
        .filter((item) => item.count > 0)
        .map((item) => `${item.fullName}: ${item.count}`)
        .join(', ');
      this.leadUploadStatus.set(
        `Uploaded ${response.totalUploaded} leads and assigned them across ${response.telecallersCount} active telecallers${distribution ? ` (${distribution})` : ''}.`
      );
    } catch (error) {
      const message = error instanceof HttpErrorResponse
        ? error.error?.error || error.message
        : error instanceof Error ? error.message : 'Unable to upload leads.';
      this.leadUploadError.set(message);
    } finally {
      this.isUploadingLeads.set(false);
    }
  }

  openModal() {
    if (!this.canCreateLeads()) {
      alert('Access Denied: Only Digital Marketing and Admin roles can create leads.');
      return;
    }
    this.resetAddLeadForm();
    const cmps = this.availableCampaigns();
    if (cmps.length > 0) {
      this.newCampaignId = cmps[0].id;
      this.newCampaignName = cmps[0].name;
    } else {
      this.newCampaignId = '';
      this.newCampaignName = 'General Ad Campaign';
    }
    const tcs = this.activeTelecallers();
    if (tcs.length > 0) {
      this.newAssignedTelecallerId = tcs[0].id;
    } else {
      this.newAssignedTelecallerId = '';
    }
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.resetAddLeadForm();
  }

  resetAddLeadForm() {
    this.newFirstName = '';
    this.newLastName = '';
    this.newEmail = '';
    this.newPhone = '';
    this.newSource = 'Digital Ads Lead Form';
    this.newCampaignId = '';
    this.newCampaignName = '';
    this.newAssignedTelecallerId = '';
    this.firstNameTouched = false;
    this.lastNameTouched = false;
    this.emailTouched = false;
    this.phoneTouched = false;
    this.sourceTouched = false;
  }

  createLead() {
    this.firstNameTouched = true;
    this.lastNameTouched = true;
    this.emailTouched = true;
    this.phoneTouched = true;
    this.sourceTouched = true;

    if (!this.newFirstName.trim() || !this.newLastName.trim()) {
      alert('Validation Error: First Name and Last Name are required.');
      return;
    }
    if (!this.isPhoneValid(this.newPhone)) {
      alert('Validation Error: Please enter a valid 10-digit mobile number (e.g., +91 9876543210 or 9876543210).');
      return;
    }
    if (!this.isEmailValid(this.newEmail)) {
      alert('Validation Error: Please enter a valid email address (e.g., name@example.com).');
      return;
    }
    if (!this.newSource.trim()) {
      alert('Validation Error: Lead source is required.');
      return;
    }

    this.isCreatingLead.set(true);
    const assignedTc = this.activeTelecallers().find((t) => String(t.id).trim() === String(this.newAssignedTelecallerId).trim());

    const user = this.authService.currentUser();
    const pkg = this.packageFilterSignal()?.trim();
    const prod = this.productFilterSignal()?.trim();
    const dbPkgs = this.packageService.packages();
    const resolved = resolveProductContext(pkg, prod, dbPkgs);

    const pkgName = pkg || resolved.productName;
    const prodName = resolved.productName;

    const payload: Partial<LeadItem> & any = {
      firstName: this.newFirstName.trim(),
      lastName: this.newLastName.trim(),
      email: this.newEmail.trim(),
      phone: this.newPhone.trim(),
      source: this.newSource.trim(),
      campaignId: this.newCampaignId || 'cmp_default',
      campaignName: this.newCampaignName || 'General Digital Ads Campaign',
      assignedTo: assignedTc ? assignedTc.id : null,
      assigneeName: assignedTc ? assignedTc.fullName : 'Unassigned',
      status: assignedTc ? 'ASSIGNED' : 'NEW',
      creatorId: user?.id,
      creatorEmail: user?.email,
      creatorName: user?.fullName || (user?.role === 'DIGITAL_MARKETING' ? 'Digital Marketing' : 'System Administrator'),
      productName: prodName,
      packageName: pkgName,
    };

    this.leadService.createLead(payload).subscribe({
      next: () => {
        this.isCreatingLead.set(false);
        this.closeModal();
      },
      error: (err) => {
        this.isCreatingLead.set(false);
        alert('Error creating lead: ' + (err?.error?.error || err?.message || 'Server error'));
      },
    });
  }

  assignLead(lead: LeadItem) {
    if (!this.canReassignLead(lead)) {
      alert('Access Denied: Only the creator who created this lead can reassign it.');
      return;
    }
    this.selectedLeadForAssign = lead;
    const users = this.realUsersList();
    const currentAssigneeId = String(lead.assignedTo || (lead as any).assigned_to || '').trim();
    const existing = users.find((u) => String(u.id).trim() === currentAssigneeId);

    if (existing) {
      this.selectedUserId = String(existing.id);
      this.assigneeName = existing.fullName;
    } else if (users.length > 0) {
      this.selectedUserId = String(users[0].id);
      this.assigneeName = users[0].fullName;
    } else {
      this.selectedUserId = '';
      this.assigneeName = 'Unassigned';
    }
  }

  onUserSelectChange(event: Event) {
    const rawVal = (event.target as HTMLSelectElement).value;
    this.onUserSelected(rawVal);
  }

  onUserSelected(userIdVal: any) {
    const userId = String(userIdVal || '').trim();
    this.selectedUserId = userId;
    const found = this.realUsersList().find((u) => String(u.id).trim() === userId);
    if (found) {
      this.assigneeName = found.fullName;
    }
  }

  confirmAssign() {
    if (!this.selectedLeadForAssign || !this.selectedUserId) return;
    const targetUserId = String(this.selectedUserId).trim();
    const foundUser = this.realUsersList().find((u) => String(u.id).trim() === targetUserId);
    const targetName = foundUser ? foundUser.fullName : (this.assigneeName || 'Assigned Telecaller');
    const user = this.authService.currentUser();
    const pkg = this.packageFilterSignal()?.trim();
    const prod = this.productFilterSignal()?.trim();
    const dbPkgs = this.packageService.packages();
    const resolved = resolveProductContext(pkg, prod, dbPkgs);

    const pkgName = this.selectedLeadForAssign.campaignName || pkg || resolved.productName;
    const prodName = resolved.productName;

    this.leadService.assignLead(this.selectedLeadForAssign.id, targetUserId, targetName, {
      creatorName: user?.fullName || 'System Administrator',
      productName: prodName,
      packageName: pkgName,
    }).subscribe({
      next: () => {
        this.selectedLeadForAssign = null;
        this.leadService.loadLeads().subscribe();
      },
      error: (err) => {
        alert('Failed to reassign lead: ' + (err?.error?.error || err?.message || 'Server error'));
      },
    });
  }

  readonly myLeadsList = computed(() => {
    let list = this.leadService.leads();
    const user = this.authService.currentUser();
    const pkg = this.packageFilterSignal()?.trim();
    const prod = this.productFilterSignal()?.trim();
    const dbPkgs = this.packageService.packages();

    if (user && user.role === 'TELECALLER') {
      list = list.filter((l) => isLeadAssignedToUser(l, user));
    }

    if ((pkg && pkg.toLowerCase() !== 'all') || (prod && prod.toLowerCase() !== 'all')) {
      list = list.filter((l) => isItemForPackage(l, pkg, prod, dbPkgs));
    }

    return list;
  });

  readonly filteredLeadsList = computed<LeadItem[]>(() => {
    let list = this.myLeadsList();

   
    const st = (this.filterStatus() || 'ALL').trim();
    if (st !== 'ALL') {
      const cleanSt = st.toUpperCase().replace(/[\s_-]+/g, '');
      list = list.filter((l) => {
        const leadSt = String(l.status || '').toUpperCase().replace(/[\s_-]+/g, '');
        if (leadSt === cleanSt) return true;
        if (cleanSt === 'BUSY' && (leadSt === 'LINEBUSY' || leadSt === 'BUSY')) return true;
        if (cleanSt === 'LINEBUSY' && (leadSt === 'LINEBUSY' || leadSt === 'BUSY')) return true;
        if (cleanSt === 'PAID' && (leadSt === 'PAID' || leadSt === 'QUALIFIED' || leadSt === 'CONVERTED')) return true;
        if (cleanSt === 'QUALIFIED' && (leadSt === 'PAID' || leadSt === 'QUALIFIED' || leadSt === 'CONVERTED')) return true;
        if (cleanSt === 'FOLLOWUP' && (leadSt.includes('FOLLOWUP') || leadSt === 'FOLLOWUP')) return true;
        if (cleanSt === 'WRONGNUMBER' && (leadSt === 'WRONGNUMBER' || leadSt.includes('WRONG'))) return true;
        return false;
      });
    }

  
    const query = (this.searchQuery() || '').toLowerCase().trim();
    if (query) {
      const cleanDigits = query.replace(/\D/g, '');
      list = list.filter((l) => {
        const name = `${l.firstName || ''} ${l.lastName || ''}`.toLowerCase();
        const phone = String(l.phone || '').toLowerCase();
        const phoneDigits = phone.replace(/\D/g, '');
        const email = String(l.email || '').toLowerCase();
        const campaign = String(l.campaignName || (l as any).campaign_name || '').toLowerCase();
        const source = String(l.source || '').toLowerCase();
        const assignee = String(l.assigneeName || (l as any).assignee_name || '').toLowerCase();
        const status = String(l.status || '').toLowerCase().replace(/_/g, ' ');

        return (
          name.includes(query) ||
          email.includes(query) ||
          campaign.includes(query) ||
          source.includes(query) ||
          assignee.includes(query) ||
          status.includes(query) ||
          phone.includes(query) ||
          (cleanDigits.length >= 3 && phoneDigits.includes(cleanDigits))
        );
      });
    }

  
    const tc = (this.filterTelecaller() || 'ALL').trim();
    if (tc === 'UNASSIGNED') {
      list = list.filter((l) => {
        const aTo = String(l.assignedTo || (l as any).assigned_to || '').trim();
        const aName = String(l.assigneeName || (l as any).assignee_name || '').toLowerCase().trim();
        return !aTo || aName === 'unassigned' || aName === '';
      });
    } else if (tc !== 'ALL') {
      const tcVal = tc.toLowerCase();
      const allUsers = this.userMgmtService.users();
      const matchedUser = allUsers.find(
        (u) => String(u.id).trim().toLowerCase() === tcVal || (u.fullName && u.fullName.toLowerCase().trim() === tcVal)
      );
      const matchedName = matchedUser?.fullName?.toLowerCase().trim() || tcVal;
      const matchedId = String(matchedUser?.id || tc).trim().toLowerCase();

      list = list.filter((l) => {
        const lAssignedId = String(l.assignedTo || (l as any).assigned_to || '').trim().toLowerCase();
        const lAssigneeName = String(l.assigneeName || (l as any).assignee_name || '').toLowerCase().trim();

  
        if (lAssignedId && (lAssignedId === matchedId || lAssignedId === tcVal)) return true;

       
        if (lAssigneeName && matchedName) {
          if (lAssigneeName === matchedName) return true;
          if (lAssigneeName.includes(matchedName) || matchedName.includes(lAssigneeName)) return true;
        }

        if (matchedUser && isLeadAssignedToUser(l, matchedUser)) return true;

        return false;
      });
    }


    const cmp = (this.filterCampaign() || 'ALL').trim();
    if (cmp !== 'ALL') {
      const cmpLower = cmp.toLowerCase();
      const matchedCamp = this.availableCampaigns().find(
        (c) => String(c.id).trim() === cmp || (c.name && c.name.toLowerCase().trim() === cmpLower)
      );
      const targetCampName = (matchedCamp?.name || cmp).toLowerCase().trim();
      const targetCampId = String(matchedCamp?.id || cmp).trim().toLowerCase();

      list = list.filter((l) => {
        const lCmpId = String(l.campaignId || (l as any).campaign_id || '').trim().toLowerCase();
        const lCmpName = String(l.campaignName || (l as any).campaign_name || '').toLowerCase().trim();
        if (lCmpId && targetCampId && lCmpId === targetCampId) return true;
        if (lCmpName && (lCmpName === targetCampName || lCmpName === cmpLower)) return true;
        if (targetCampName && lCmpName && (lCmpName.includes(targetCampName) || targetCampName.includes(lCmpName))) return true;
        return false;
      });
    }

    return list;
  });

  get filteredLeads(): LeadItem[] {
    return this.filteredLeadsList();
  }

  get paginatedLeads(): LeadItem[] {
    const list = this.filteredLeadsList();
    const page = this.currentPage();
    const size = this.pageSize();
    const start = (page - 1) * size;
    return list.slice(start, start + size);
  }

  readonly totalPages = computed<number>(() => {
    const totalItems = this.filteredLeadsList().length;
    const size = this.pageSize();
    return Math.max(1, Math.ceil(totalItems / size));
  });

  hasActiveFilters(): boolean {
    return (
      (this.searchQuery() || '').trim() !== '' ||
      (this.filterStatus() || 'ALL') !== 'ALL' ||
      (this.filterTelecaller() || 'ALL') !== 'ALL' ||
      (this.filterCampaign() || 'ALL') !== 'ALL'
    );
  }

  onSearchChange(val: string): void {
    this.searchQuery.set(val);
    this.currentPage.set(1);
  }

  onStatusChange(val: string): void {
    this.filterStatus.set(val);
    this.currentPage.set(1);
  }

  onTelecallerChange(val: string): void {
    this.filterTelecaller.set(val);
    this.currentPage.set(1);
  }

  onCampaignChange(val: string): void {
    this.filterCampaign.set(val);
    this.currentPage.set(1);
  }

  setPage(page: number | string): void {
    const p = typeof page === 'number' ? page : parseInt(page, 10);
    if (!isNaN(p) && p >= 1 && p <= this.totalPages()) {
      this.currentPage.set(p);
    }
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update((p) => p - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((p) => p + 1);
    }
  }

  setPageSize(size: number | any): void {
    const s = Number(size) || 10;
    this.pageSize.set(s);
    this.currentPage.set(1);
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.filterStatus.set('ALL');
    this.filterTelecaller.set('ALL');
    this.filterCampaign.set('ALL');
    this.currentPage.set(1);
  }

  mathMin(a: number, b: number): number {
    return Math.min(a, b);
  }

  getPageNumbers(): (number | string)[] {
    const total = this.totalPages();
    const current = this.currentPage();
    if (total <= 7) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    pages.push(1);
    if (current > 3) {
      pages.push('...');
    }
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    if (current < total - 2) {
      pages.push('...');
    }
    pages.push(total);
    return pages;
  }

  getStatusBadgeClass(status?: string): string {
    const s = (status || '').toUpperCase().trim();
    switch (s) {
      case 'NEW':
        return 'status-pill-sky';
      case 'ASSIGNED':
        return 'status-pill-slate';
      case 'CONTACTED':
        return 'status-pill-indigo';
      case 'CONNECTED':
        return 'status-pill-blue';
      case 'NO_ANSWER':
        return 'status-pill-amber';
      case 'BUSY':
      case 'LINE_BUSY':
        return 'status-pill-orange';
      case 'INTERESTED':
        return 'status-pill-purple';
      case 'QUALIFIED':
        return 'status-pill-emerald';
      case 'CONVERTED':
      case 'PAID':
        return 'status-pill-teal';
      case 'NOT_INTERESTED':
        return 'status-pill-rose';
      case 'WRONG_NUMBER':
      case 'LOST':
        return 'status-pill-danger';
      default:
        return 'status-pill-slate';
    }
  }

   isLeadCreator(lead: LeadItem): boolean {
    if (!lead) return false;
    const user = this.authService.currentUser();
    if (!user) return false;
    const userId = String(user.id !== undefined && user.id !== null ? user.id : '').trim().toLowerCase();
    const userEmail = String(user.email || '').toLowerCase().trim();
    const userName = String(user.fullName || '').toLowerCase().trim();

    const rawLead = lead as any;
    const leadCreatorId = String(
      rawLead.creatorId !== undefined && rawLead.creatorId !== null
        ? rawLead.creatorId
        : (rawLead.creator_id !== undefined && rawLead.creator_id !== null ? rawLead.creator_id : '')
    ).trim().toLowerCase();
    const leadCreatorEmail = String(rawLead.creatorEmail || rawLead.creator_email || '').toLowerCase().trim();
    const leadCreatorName = String(rawLead.creatorName || rawLead.creator_name || '').toLowerCase().trim();

    const matchesId = Boolean(userId && leadCreatorId && userId === leadCreatorId);
    const matchesEmail = Boolean(userEmail && leadCreatorEmail && userEmail === leadCreatorEmail);
    const matchesName = Boolean(userName && leadCreatorName && userName === leadCreatorName);
    const isAdmin = Boolean(user.role === 'ADMINISTRATOR');

    return matchesId || matchesEmail || matchesName || isAdmin;
  }

  canReassignLead(lead: LeadItem): boolean {
    return this.isLeadCreator(lead);
  }

  canEditOrDeleteLead(lead: LeadItem): boolean {
    return this.isLeadCreator(lead);
  }


  readonly selectedLeadForDetails = signal<LeadItem | null>(null);

  openLeadDetails(lead: LeadItem) {
    this.selectedLeadForDetails.set(lead);
  }

  closeLeadDetails() {
    this.selectedLeadForDetails.set(null);
  }

  getLeadHistoryCalls(lead: LeadItem | null): CallActivityItem[] {
    if (!lead) return [];
    const allCalls = this.leadService.calls();
    const lId = String(lead.id || '').trim().toLowerCase();
    const lPhone = String(lead.phone || '').replace(/\D/g, '');
    const lName = `${lead.firstName || ''} ${lead.lastName || ''}`.trim().toLowerCase();

    return allCalls.filter((c) => {
      const cLeadId = String(c.leadId || '').trim().toLowerCase();
      const cPhone = String(c.leadPhone || c.phone || '').replace(/\D/g, '');
      const cLeadName = String(c.leadName || '').trim().toLowerCase();
      if (cLeadId && lId && cLeadId === lId) return true;
      if (lPhone && cPhone && lPhone === cPhone) return true;
      if (cLeadName && lName && (cLeadName === lName || cLeadName.includes(lName) || lName.includes(cLeadName))) return true;
      return false;
    });
  }


  readonly showEditModal = signal<boolean>(false);
  readonly editingLead = signal<LeadItem | null>(null);
  readonly isSavingEdit = signal<boolean>(false);
  readonly editLeadError = signal<string | null>(null);

  editFirstName = '';
  editLastName = '';
  editEmail = '';
  editPhone = '';
  editSource = '';
  editCampaignName = '';
  editStatus = 'NEW';
  editAssignedTo = '';

  openEditLeadModal(lead: LeadItem) {
    if (!this.canEditOrDeleteLead(lead)) {
      alert('Access Denied: Only the creator who created this lead can edit it.');
      return;
    }
    this.editingLead.set(lead);
    this.editFirstName = lead.firstName || '';
    this.editLastName = lead.lastName || '';
    this.editEmail = lead.email || '';
    this.editPhone = lead.phone || '';
    this.editSource = lead.source || 'Digital Ads Lead Form';
    this.editCampaignName = lead.campaignName || '';
    this.editStatus = lead.status || 'NEW';
    this.editAssignedTo = lead.assignedTo || '';
    this.editLeadError.set(null);
    this.showEditModal.set(true);
  }

  closeEditLeadModal() {
    this.showEditModal.set(false);
    this.editingLead.set(null);
    this.editLeadError.set(null);
  }

  saveLeadEdit() {
    const lead = this.editingLead();
    if (!lead) return;

    if (!this.editFirstName.trim() || !this.editPhone.trim()) {
      this.editLeadError.set('First name and phone number are required.');
      return;
    }

    this.isSavingEdit.set(true);
    this.editLeadError.set(null);

    const tc = this.activeTelecallers().find((u) => String(u.id) === String(this.editAssignedTo));
    const assigneeName = tc ? tc.fullName : (this.editAssignedTo ? 'Telecaller' : 'Unassigned');

    this.leadService.updateLead(lead.id, {
      firstName: this.editFirstName.trim(),
      lastName: this.editLastName.trim(),
      email: this.editEmail.trim(),
      phone: this.editPhone.trim(),
      source: this.editSource.trim(),
      status: this.editStatus as any,
      campaignName: this.editCampaignName.trim(),
      assignedTo: this.editAssignedTo || null,
      assigneeName,
    }).subscribe({
      next: () => {
        this.isSavingEdit.set(false);
        this.closeEditLeadModal();
      },
      error: (err) => {
        this.isSavingEdit.set(false);
        this.editLeadError.set(err?.error?.error || err?.message || 'Failed to update lead.');
      }
    });
  }

  deleteLead(lead: LeadItem) {
    if (!this.canEditOrDeleteLead(lead)) {
      alert('Access Denied: Only the creator who created this lead can delete it.');
      return;
    }
    const leadName = `${lead.firstName} ${lead.lastName || ''}`.trim();
    if (confirm(`Are you sure you want to permanently delete lead "${leadName}"? This action cannot be undone.`)) {
      this.leadService.deleteLead(lead.id).subscribe({
        next: () => {
          
        },
        error: (err) => {
          alert(err?.error?.error || err?.message || 'Failed to delete lead.');
        }
      });
    }
  }
}
