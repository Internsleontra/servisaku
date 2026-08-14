const delay = (ms) => new Promise(res => setTimeout(res, ms));

const generateId = () => Math.random().toString(36).substr(2, 9);

class MockEntity {
  constructor(name) {
    this.name = name;
    this.subscribers = new Set();
  }

  _getData() {
    const data = localStorage.getItem(`mock_${this.name}`);
    return data ? JSON.parse(data) : [];
  }

  _saveData(data) {
    localStorage.setItem(`mock_${this.name}`, JSON.stringify(data));
    // Notify all subscribers whenever data changes
    data.forEach(item => {
      this.subscribers.forEach(sub => sub(item));
    });
  }

  async get(id) {
    await delay(200);
    const data = this._getData();
    return data.find(i => i.id === id);
  }

  async create(payload) {
    await delay(300);
    const data = this._getData();
    const newItem = { id: generateId(), created_date: new Date().toISOString(), ...payload };
    data.push(newItem);
    this._saveData(data);
    return newItem;
  }

  async update(id, payload) {
    await delay(200);
    const data = this._getData();
    const index = data.findIndex(i => i.id === id);
    if (index === -1) throw new Error("Not found");
    data[index] = { ...data[index], ...payload, updated_date: new Date().toISOString() };
    this._saveData(data);
    return data[index];
  }

  async claim(id) {
    return this.update(id, { status: 'accepted' });
  }

  async addPhotos(id, { phase, photos }) {
    const cur = await this.get(id);
    const existing = cur?.photos || {};
    return this.update(id, { photos: { ...existing, [phase]: [...(existing[phase] || []), ...photos] } });
  }

  async addExtra(id, { label, unit_price, qty = 1 }) {
    const cur = await this.get(id);
    const extras = [...(cur?.extras || []), { id: `extra_${Date.now()}`, label, unit_price, qty, total: unit_price * qty, status: 'pending' }];
    return this.update(id, { extras });
  }

  async decideExtra(id, itemId, { status }) {
    const cur = await this.get(id);
    const extras = (cur?.extras || []).map((e) => e.id === itemId ? { ...e, status } : e);
    const approved = (cur?.extras || []).find((e) => e.id === itemId && status === 'approved');
    const price = approved ? (cur.price || 0) + approved.total : cur.price;
    return this.update(id, { extras, price });
  }

  async delete(id) {
    await delay(200);
    const data = this._getData();
    const newData = data.filter(i => i.id !== id);
    this._saveData(newData);
  }

  async filter(query = {}, orderBy = null, limit = null) {
    await delay(200);
    let data = this._getData();
    
    // Apply filters
    for (const key in query) {
      data = data.filter(item => item[key] === query[key]);
    }

    // Apply sorting
    if (orderBy) {
      data.sort((a, b) => {
        if (a[orderBy] < b[orderBy]) return -1;
        if (a[orderBy] > b[orderBy]) return 1;
        return 0;
      });
    }

    // Apply limit
    if (limit) {
      data = data.slice(0, limit);
    }

    return data;
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
}

// ── Hardcoded demo credentials (always work, even offline) ──
const DEMO_USERS = {
  'user@servisaku.my':    { id: 'user-demo-1',    password: 'user123',    email: 'user@servisaku.my',    full_name: 'Demo User',      role: 'consumer', city: 'Kuala Lumpur' },
  'admin@servisaku.my':   { id: 'admin-demo-1',   password: 'admin123',   email: 'admin@servisaku.my',   full_name: 'Admin ServisAku', role: 'admin',    city: 'Kuala Lumpur' },
  'ali@servisaku.my':     { id: 'partner-demo-1', password: 'partner123', email: 'ali@servisaku.my',     full_name: 'Ali Ahmad',       role: 'partner',  city: 'Kuala Lumpur', partner_verified: true, partner_rating: 4.9, bio: 'Expert home cleaner with 5 years experience.' },
  'raj@servisaku.my':     { id: 'partner-demo-2', password: 'partner123', email: 'raj@servisaku.my',     full_name: 'Raj Kumar',       role: 'partner',  city: 'Petaling Jaya', partner_verified: true, partner_rating: 4.7, bio: 'AC servicing and deep cleaning specialist.' },
  'chong@servisaku.my':   { id: 'partner-demo-3', password: 'partner123', email: 'chong@servisaku.my',   full_name: 'David Chong',     role: 'partner',  city: 'Subang Jaya',   partner_verified: true, partner_rating: 5.0, bio: 'Professional pest control and exterminator.' },
  'siti@servisaku.my':    { id: 'partner-demo-4', password: 'partner123', email: 'siti@servisaku.my',    full_name: 'Siti Nurhaliza',  role: 'partner',  city: 'Kuala Lumpur',  partner_verified: true, partner_rating: 4.8, bio: 'Plumbing and home repair expert.' },
};

// Mock initial data if empty
const initializeMockData = () => {
  if (!localStorage.getItem('mock_User')) {
    localStorage.setItem('mock_User', JSON.stringify(Object.values(DEMO_USERS).map(u => ({ ...u, id: u.id, created_date: new Date().toISOString() }))));
  }
  
  if (!localStorage.getItem('mock_Booking')) {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 3);
    localStorage.setItem('mock_Booking', JSON.stringify([
      { id: 'bk1', service_type: 'House Cleaning', consumer_name: 'John Doe', consumer_email: 'john@demo.com', partner_email: 'ali@demo.com', status: 'completed', price: 120, date: pastDate.toISOString(), created_date: pastDate.toISOString() },
      { id: 'bk2', service_type: 'AC Servicing', consumer_name: 'Sarah Lee', consumer_email: 'sarah@demo.com', partner_email: 'raj@demo.com', status: 'completed', price: 150, date: pastDate.toISOString(), created_date: pastDate.toISOString() },
      { id: 'bk3', service_type: 'Plumbing Repair', consumer_name: 'Mike Tan', consumer_email: 'mike@demo.com', partner_email: 'ali@demo.com', status: 'completed', price: 200, date: new Date().toISOString(), created_date: new Date().toISOString() },
      { id: 'bk4', service_type: 'Deep Cleaning', consumer_name: 'Emma Wong', consumer_email: 'emma@demo.com', partner_email: 'raj@demo.com', status: 'disputed', price: 300, date: pastDate.toISOString(), created_date: pastDate.toISOString() },
      { id: 'bk5', service_type: 'AC Repair', consumer_name: 'David Lim', consumer_email: 'david@demo.com', partner_email: 'raj@demo.com', status: 'completed', price: 180, date: new Date().toISOString(), created_date: new Date().toISOString() },
      { id: 'bk6', service_type: 'Office Cleaning', consumer_name: 'Lisa Ng', consumer_email: 'lisa@demo.com', partner_email: 'ali@demo.com', status: 'pending', price: 250, date: new Date().toISOString(), created_date: new Date().toISOString() },
    ]));
  }

  if (!localStorage.getItem('mock_EscrowLedger')) {
    localStorage.setItem('mock_EscrowLedger', JSON.stringify([
      { id: 'es1', booking_id: 'bk3', gross_amount: 200, platform_fee: 40, partner_payout: 160, status: 'held', created_date: new Date().toISOString() },
      { id: 'es2', booking_id: 'bk4', gross_amount: 300, platform_fee: 60, partner_payout: 240, status: 'frozen', freeze_reason: 'Consumer filed a dispute', created_date: new Date().toISOString() },
      { id: 'es3', booking_id: 'bk5', gross_amount: 180, platform_fee: 36, partner_payout: 144, status: 'held', created_date: new Date().toISOString() }
    ]));
  }

  if (!localStorage.getItem('mock_RefundRequest')) {
    localStorage.setItem('mock_RefundRequest', JSON.stringify([
      { id: 'rf1', booking_id: 'bk4', consumer_email: 'emma@demo.com', original_amount: 300, refund_amount: 300, refund_type: 'full', status: 'pending', reason: 'Service was terrible, partner left halfway.', created_date: new Date().toISOString() },
      { id: 'rf2', booking_id: 'bk7', consumer_email: 'fake@demo.com', original_amount: 100, refund_amount: 50, refund_type: 'partial', status: 'under_review', reason: 'They broke a small vase while cleaning.', created_date: new Date().toISOString() }
    ]));
  }

  if (!localStorage.getItem('mock_PayoutRecord')) {
    localStorage.setItem('mock_PayoutRecord', JSON.stringify([
      { id: 'py1', partner_email: 'ali@demo.com', partner_name: 'Ali Ahmad', gross_earning: 120, commission_amount: 24, net_payout: 96, payout_method: 'Bank Transfer', status: 'scheduled', scheduled_date: new Date().toISOString(), created_date: new Date().toISOString() },
      { id: 'py2', partner_email: 'raj@demo.com', partner_name: 'Raj Kumar', gross_earning: 150, commission_amount: 30, net_payout: 120, payout_method: 'Bank Transfer', status: 'failed', failure_reason: 'Bank account details invalid', created_date: new Date().toISOString() }
    ]));
  }

  if (!localStorage.getItem('mock_Coupon')) {
    localStorage.setItem('mock_Coupon', JSON.stringify([
      { id: 'cp1', code: 'WELCOME20', discount_type: 'percentage', discount_value: 20, max_discount_cap: 50, min_order_amount: 100, is_active: true, created_date: new Date().toISOString() },
      { id: 'cp2', code: 'RM50OFF', discount_type: 'fixed', discount_value: 50, min_order_amount: 200, is_active: true, created_date: new Date().toISOString() }
    ]));
  }
};
initializeMockData();

export const mockClient = {
  auth: {
    async me() {
      await delay(100);
      // Check token-based session first
      const tokenEmail = localStorage.getItem('mock_auth_email');
      if (tokenEmail) {
        const demo = DEMO_USERS[tokenEmail];
        if (demo) return { ...demo };
      }
      // Fallback to legacy id session
      const activeId = localStorage.getItem('mock_active_user_id');
      if (!activeId) throw new Error("Not authenticated");
      const users = JSON.parse(localStorage.getItem('mock_User') || '[]');
      const user = users.find(u => u.id === activeId);
      if (!user) throw new Error("User not found");
      return user;
    },
    async loginViaEmailPassword(email, password) {
      await delay(400);
      // Check hardcoded demo users first
      const demo = DEMO_USERS[email];
      if (demo) {
        if (demo.password !== password) throw new Error('Invalid credentials');
        localStorage.setItem('mock_auth_email', email);
        localStorage.setItem('mock_active_user_id', demo.id);
        localStorage.setItem('auth_token', 'mock-jwt-' + demo.id);
        return { access_token: 'mock-jwt-' + demo.id, user: { ...demo } };
      }
      // Then check dynamic users
      const users = JSON.parse(localStorage.getItem('mock_User') || '[]');
      const user = users.find(u => u.email === email);
      if (!user) throw new Error('Invalid credentials');
      localStorage.setItem('mock_active_user_id', user.id);
      localStorage.setItem('auth_token', 'mock-jwt-' + user.id);
      return { access_token: 'mock-jwt-' + user.id, user };
    },
    async loginWithProvider(provider) {
      // Simulate OAuth success
      await delay(500);
      const users = JSON.parse(localStorage.getItem('mock_User') || '[]');
      let user = users.find(u => u.email === 'google@demo.com');
      if (!user) {
        user = { id: generateId(), email: 'google@demo.com', full_name: 'Google Demo User', role: 'consumer' };
        users.push(user);
        localStorage.setItem('mock_User', JSON.stringify(users));
      }
      localStorage.setItem('mock_active_user_id', user.id);
      window.location.href = '/';
    },
    async register(email, password, full_name) {
      await delay(400);
      const users = JSON.parse(localStorage.getItem('mock_User') || '[]');
      if (users.find(u => u.email === email)) throw new Error("Email already exists");
      const newUser = { id: generateId(), email, full_name, role: 'consumer', created_date: new Date().toISOString() };
      users.push(newUser);
      localStorage.setItem('mock_User', JSON.stringify(users));
      return newUser;
    },
    async forgotPassword() {
      // Demo mode: no email backend; pretend success.
      await delay(300);
      return { ok: true };
    },
    async resetPassword() {
      await delay(300);
      throw new Error('Password reset is unavailable in demo mode');
    },
    async updateMe(data) {
      await delay(200);
      const activeId = localStorage.getItem('mock_active_user_id');
      if (!activeId) throw new Error("Not authenticated");
      const users = JSON.parse(localStorage.getItem('mock_User') || '[]');
      const index = users.findIndex(u => u.id === activeId);
      users[index] = { ...users[index], ...data };
      localStorage.setItem('mock_User', JSON.stringify(users));
      return users[index];
    },
    async updateConsumerProfile(data) {
      await delay(200);
      const activeId = localStorage.getItem('mock_active_user_id');
      if (!activeId) throw new Error("Not authenticated");
      const users = JSON.parse(localStorage.getItem('mock_User') || '[]');
      const index = users.findIndex(u => u.id === activeId);
      users[index] = { ...users[index], consumerProfile: { ...(users[index].consumerProfile || {}), ...data } };
      localStorage.setItem('mock_User', JSON.stringify(users));
      return users[index];
    },
    async logout() {
      localStorage.removeItem('mock_active_user_id');
      localStorage.removeItem('mock_auth_email');
      localStorage.removeItem('auth_token');
      window.location.href = '/';
    },
    async loginWithAppwrite() {
      // Appwrite/OTP auth needs the live backend; demo mode has no equivalent.
      throw new Error('OTP login requires the live backend (VITE_BACKEND=real).');
    },
    async requestPhoneOtp() {
      throw new Error('Phone OTP requires the live backend (VITE_BACKEND=real).');
    },
    async verifyPhoneOtp() {
      throw new Error('Phone OTP requires the live backend (VITE_BACKEND=real).');
    },
    redirectToLogin() {
      import('sonner').then(({ toast }) => toast.info('Redirecting to demo login...'));
      setTimeout(() => window.location.href = '/otp-login', 1000);
    }
  },
  entities: {
    User: new MockEntity('User'),
    Booking: new MockEntity('Booking'),
    ChatMessage: new MockEntity('ChatMessage'),
    PartnerLocation: new MockEntity('PartnerLocation'),
    Coupon: new MockEntity('Coupon'),
    Review: new MockEntity('Review'),
    EscrowLedger: new MockEntity('EscrowLedger'),
    RefundRequest: new MockEntity('RefundRequest'),
    PayoutRecord: new MockEntity('PayoutRecord')
  },
  integrations: {
    Core: {
      async UploadFile({ file }) {
        await delay(500);
        return { file_url: URL.createObjectURL(file) };
      }
    }
  },

  // The dynamic booking engine is DB-backed; demo mode has no catalogue.
  catalog: {
    async getCategories() { return []; },
    async getCategoryServices() { return { category: null, services: [] }; },
    async getServices() { return []; },
    async getService() { throw new Error('Live booking requires the backend (demo mode)'); },
    async calculate() { throw new Error('Live pricing requires the backend (demo mode)'); },
    async createBooking() { throw new Error('Booking requires the backend (demo mode)'); },
  },

  payments: {
    // Demo mode has no gateway, but the checkout still needs a method list to
    // render — return the same shape the backend registry produces.
    async methods() {
      return [
        { id: 'fpx', label: 'FPX Online Banking', icon: 'Landmark', sub: 'Maybank, CIMB, Public Bank, RHB', online: true, available: false, provider: null },
        { id: 'duitnow', label: 'DuitNow', icon: 'QrCode', sub: 'Pay from any Malaysian bank', online: true, available: false, provider: null },
        { id: 'card', label: 'Credit / Debit Card', icon: 'CreditCard', sub: 'Visa, Mastercard', online: true, available: false, provider: null },
        { id: 'cash', label: 'Cash on Service', icon: 'Banknote', sub: 'Pay your professional at completion', online: false, available: false, provider: null },
      ];
    },
    async create() { throw new Error('Payments require the live backend (VITE_BACKEND=real).'); },
    async sync() { throw new Error('Payments require the live backend (VITE_BACKEND=real).'); },
    async get() { throw new Error('Payments require the live backend (VITE_BACKEND=real).'); },
    async collectCash() { throw new Error('Payments require the live backend (VITE_BACKEND=real).'); },
  },

  invoices: {
    async list() { return []; },
    async get() { throw new Error('Invoices require the live backend (VITE_BACKEND=real).'); },
    async forBooking() { return []; },
  },

  tax: {
    async config() {
      return { code: 'SST_SERVICE', rate: 0.08, rate_percent: 8, inclusive: false, registration_no: null, configured: false };
    },
  },

  wallet: {
    async get() {
      return {
        lifetime: 0, pending: 0, withdrawn: 0, withdrawable: 0, balance: 0, currency: 'MYR',
        outstanding_commission: 0, payouts_suspended: false, is_frozen: false,
      };
    },
    async withdraw() { throw new Error('Withdrawals require the backend (demo mode)'); },
    async detail() {
      return {
        available_balance: 0, pending_balance: 0, outstanding_commission: 0,
        lifetime_earnings: 0, lifetime_commission: 0, credit_limit: 50,
        settlement_cycle: 'weekly', is_frozen: false, payouts_suspended: false, currency: 'MYR',
      };
    },
    async ledger() { return { items: [], total: 0, limit: 50, offset: 0 }; },
    async settlements() { return []; },
    async settlement() { throw new Error('Settlements require the backend (demo mode)'); },
    async paySettlement() { throw new Error('Settlements require the backend (demo mode)'); },
    async paySettlementFromBalance() { throw new Error('Settlements require the backend (demo mode)'); },
  },

  availability: {
    async get() {
      return {
        working_days: [1, 2, 3, 4, 5], start_time: '09:00', end_time: '18:00',
        lunch: { enabled: false, start: '13:00', end: '14:00' },
        vacation_mode: false, instant_booking: true, max_daily_jobs: 6,
        coverage_radius_km: 10, preferred_areas: [], preferred_categories: [], unavailable_dates: [],
      };
    },
    async update(payload) { return payload; },
  },

  documents: {
    async list() { return { documents: [], required_total: 0, required_verified: 0, progress: 100, activated: false }; },
    async submit() { throw new Error('Document upload requires the backend (demo mode)'); },
  },

  training: {
    async list() { return { courses: [], total: 0, completed: 0, mandatory_total: 0, mandatory_completed: 0, certified: false, progress: 0 }; },
    async complete() { throw new Error('Training requires the backend (demo mode)'); },
  },

  reviews: {
    async mine() { return []; },
    async reply() { throw new Error('Requires the backend (demo mode)'); },
    async report() { throw new Error('Requires the backend (demo mode)'); },
  },

  support: {
    async list() { return []; },
    async create() { throw new Error('Requires the backend (demo mode)'); },
    async get() { throw new Error('Requires the backend (demo mode)'); },
    async reply() { throw new Error('Requires the backend (demo mode)'); },
    async resolve() { throw new Error('Requires the backend (demo mode)'); },
    async reopen() { throw new Error('Requires the backend (demo mode)'); },
    async csat() { throw new Error('Requires the backend (demo mode)'); },
    async requestCallback() { throw new Error('Requires the backend (demo mode)'); },
  },

  // Money and legal records have no meaningful demo behaviour — a fake refund
  // amount or a fake acceptance record would be worse than an honest error.
  refunds: {
    async list() { return []; },
    async get() { throw new Error('Requires the backend (demo mode)'); },
    async preview() { throw new Error('Refund amounts require the live backend (VITE_BACKEND=real).'); },
    async request() { throw new Error('Refunds require the live backend (VITE_BACKEND=real).'); },
    async cancel() { throw new Error('Requires the backend (demo mode)'); },
  },

  disputes: {
    async list() { return []; },
    async get() { throw new Error('Requires the backend (demo mode)'); },
    async create() { throw new Error('Requires the backend (demo mode)'); },
    async addEvidence() { throw new Error('Requires the backend (demo mode)'); },
  },

  damageClaims: {
    async list() { return []; },
    async get() { throw new Error('Requires the backend (demo mode)'); },
    async create() { throw new Error('Requires the backend (demo mode)'); },
    async addEvidence() { throw new Error('Requires the backend (demo mode)'); },
    async appeal() { throw new Error('Requires the backend (demo mode)'); },
  },

  legal: {
    async documents() { return []; },
    async document() { throw new Error('Requires the backend (demo mode)'); },
    async pending() { return { documents: [] }; },
    async accept() { throw new Error('Legal acceptance requires the live backend (VITE_BACKEND=real).'); },
    async acceptMany() { throw new Error('Legal acceptance requires the live backend (VITE_BACKEND=real).'); },
  },

  inventory: {
    async list() { return []; },
    async create() { throw new Error('Requires the backend (demo mode)'); },
    async update() { throw new Error('Requires the backend (demo mode)'); },
    async remove() { throw new Error('Requires the backend (demo mode)'); },
  },

  onboarding: {
    async get() { return { draft: null, profile: null, submitted: false, account: {} }; },
    async saveDraft(draft) { return { ok: true, draft }; },
    async submit() { throw new Error('Requires the backend (demo mode)'); },
    async requestPhoneOtp() { throw new Error('Phone verification requires the live backend.'); },
    async verifyPhoneOtp() { throw new Error('Phone verification requires the live backend.'); },
  },

  // Saved addresses (localStorage-backed in demo mode).
  addresses: {
    _read() { return JSON.parse(localStorage.getItem('mock_addresses') || '[]'); },
    _write(list) { localStorage.setItem('mock_addresses', JSON.stringify(list)); },
    async list() { await delay(150); return this._read(); },
    async add(a) {
      await delay(200);
      const list = this._read();
      const entry = { id: generateId(), ...a };
      if (entry.is_default || list.length === 0) { list.forEach(x => { x.is_default = false; }); entry.is_default = true; }
      list.push(entry); this._write(list); return entry;
    },
    async update(id, a) {
      await delay(200);
      const list = this._read();
      const i = list.findIndex(x => x.id === id);
      if (i === -1) throw new Error('Address not found');
      list[i] = { ...list[i], ...a };
      if (a.is_default) list.forEach((x, j) => { x.is_default = j === i; });
      this._write(list); return list[i];
    },
    async remove(id) { await delay(150); this._write(this._read().filter(x => x.id !== id)); return { ok: true }; },
  },
};
