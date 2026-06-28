/*
  Shared customer profile source.
  Keep customer fields, list loading, matching, and save payloads centralized so
  tickets, orders, and profile management do not drift.
*/

const CUSTOMER_SOURCE = (() => {
  const SELECT = 'id, name, contact_person, phone, phone2, email, gstin, address, city, state, pincode, notes, created_by, updated_at'

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  function clean(value) {
    const text = String(value ?? '').trim()
    return text || null
  }

  function normalize(customer = {}) {
    return {
      id: customer.id || '',
      name: customer.name || '',
      contact_person: customer.contact_person || '',
      phone: customer.phone || '',
      phone2: customer.phone2 || '',
      email: customer.email || '',
      gstin: customer.gstin || '',
      address: customer.address || '',
      city: customer.city || '',
      state: customer.state || '',
      pincode: customer.pincode || '',
      notes: customer.notes || '',
      created_by: customer.created_by || null,
      updated_at: customer.updated_at || null,
    }
  }

  async function loadCustomers() {
    return db.from('customers').select(SELECT).order('name')
  }

  function searchText(customer) {
    const c = normalize(customer)
    return [c.name, c.contact_person, c.phone, c.phone2, c.email, c.gstin, c.city, c.state]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  }

  function filter(customers, query) {
    const q = String(query || '').trim().toLowerCase()
    if (!q) return customers || []
    return (customers || []).filter(customer => searchText(customer).includes(q))
  }

  function displayDetails(customer) {
    const c = normalize(customer)
    return [c.phone, c.phone2, c.email, c.city, c.state].filter(Boolean).join(' | ')
  }

  function formFields(prefix, customer = {}, options = {}) {
    const c = normalize(customer)
    const nameLabel = options.nameLabel || 'Name'
    return `
      <div class="form-row cols-2">
        <div class="form-group"><label>${esc(nameLabel)}</label><input id="${prefix}-name" value="${esc(c.name)}" placeholder="Customer name"></div>
        <div class="form-group"><label>Contact Person</label><input id="${prefix}-contact" value="${esc(c.contact_person)}" placeholder="Contact person"></div>
      </div>
      <div class="form-row cols-2">
        <div class="form-group"><label>Phone</label><input id="${prefix}-phone" value="${esc(c.phone)}" type="tel" placeholder="Primary phone"></div>
        <div class="form-group"><label>Alternate Phone</label><input id="${prefix}-phone2" value="${esc(c.phone2)}" type="tel" placeholder="Alternate phone"></div>
      </div>
      <div class="form-row cols-2">
        <div class="form-group"><label>Email</label><input id="${prefix}-email" value="${esc(c.email)}" type="email" placeholder="email@example.com"></div>
        <div class="form-group"><label>GSTIN</label><input id="${prefix}-gstin" value="${esc(c.gstin)}" placeholder="GST number" style="text-transform:uppercase;"></div>
      </div>
      <div class="form-group"><label>Address</label><input id="${prefix}-address" value="${esc(c.address)}" placeholder="Street address"></div>
      <div class="form-row cols-3">
        <div class="form-group"><label>City</label><input id="${prefix}-city" value="${esc(c.city)}" placeholder="City"></div>
        <div class="form-group"><label>State</label><input id="${prefix}-state" value="${esc(c.state)}" placeholder="State"></div>
        <div class="form-group"><label>Pincode</label><input id="${prefix}-pincode" value="${esc(c.pincode)}" placeholder="Pincode"></div>
      </div>
      <div class="form-group"><label>Notes</label><input id="${prefix}-notes" value="${esc(c.notes)}" placeholder="Profile notes"></div>`
  }

  function readForm(prefix, options = {}) {
    const payload = {
      name: clean(document.getElementById(`${prefix}-name`)?.value),
      contact_person: clean(document.getElementById(`${prefix}-contact`)?.value),
      phone: clean(document.getElementById(`${prefix}-phone`)?.value),
      phone2: clean(document.getElementById(`${prefix}-phone2`)?.value),
      email: clean(document.getElementById(`${prefix}-email`)?.value),
      gstin: clean(document.getElementById(`${prefix}-gstin`)?.value)?.toUpperCase() || null,
      address: clean(document.getElementById(`${prefix}-address`)?.value),
      city: clean(document.getElementById(`${prefix}-city`)?.value),
      state: clean(document.getElementById(`${prefix}-state`)?.value),
      pincode: clean(document.getElementById(`${prefix}-pincode`)?.value),
      notes: clean(document.getElementById(`${prefix}-notes`)?.value),
    }
    if (options.createdBy) payload.created_by = options.createdBy
    return payload
  }

  function fillForm(prefix, customer = {}) {
    const c = normalize(customer)
    for (const [key, value] of Object.entries({
      name: c.name,
      contact: c.contact_person,
      phone: c.phone,
      phone2: c.phone2,
      email: c.email,
      gstin: c.gstin,
      address: c.address,
      city: c.city,
      state: c.state,
      pincode: c.pincode,
      notes: c.notes,
    })) {
      const el = document.getElementById(`${prefix}-${key}`)
      if (el) el.value = value || ''
    }
  }

  async function insertCustomer(payload) {
    let result = await db.from('customers').insert(payload).select(SELECT).single()
    if (result.error && /created_by/i.test(result.error.message || '')) {
      const fallback = { ...payload }
      delete fallback.created_by
      result = await db.from('customers').insert(fallback).select(SELECT).single()
    }
    return result
  }

  return {
    SELECT,
    normalize,
    loadCustomers,
    filter,
    displayDetails,
    formFields,
    readForm,
    fillForm,
    insertCustomer,
  }
})()
