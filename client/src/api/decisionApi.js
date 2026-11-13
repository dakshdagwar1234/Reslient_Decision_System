const API_BASE = '/api/v1';

export async function fetchHealth() {
  const res = await fetch('/health');
  if (!res.ok) throw new Error(`Health check failed: ${res.statusText}`);
  return res.json();
}

export async function fetchMetrics() {
  const res = await fetch(`${API_BASE}/metrics`);
  if (!res.ok) throw new Error(`Failed to load metrics`);
  return res.json();
}

export async function fetchDecisions(params = {}) {
  const query = new URLSearchParams(params).toString();
  const res = await fetch(`${API_BASE}/decisions?${query}`);
  if (!res.ok) throw new Error(`Failed to fetch decisions`);
  return res.json();
}

export async function fetchDecisionDetails(id) {
  const res = await fetch(`${API_BASE}/decisions/${id}`);
  if (!res.ok) throw new Error(`Failed to load decision details`);
  return res.json();
}

export async function fetchAuditTrail(id) {
  const res = await fetch(`${API_BASE}/decisions/${id}/audit-trail`);
  if (!res.ok) throw new Error(`Failed to load audit trail`);
  return res.json();
}

export async function evaluateApplication(payload, idempotencyKey) {
  const res = await fetch(`${API_BASE}/decisions/evaluate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  return {
    ok: res.ok,
    status: res.status,
    headers: {
      isCacheHit: res.headers.get('x-cache-lookup') === 'HIT',
      isIdempotentReplay: res.headers.get('x-idempotent-replay') === 'true'
    },
    data
  };
}

export async function submitManualReview(id, { reviewDecision, reviewedBy, notes }) {
  const res = await fetch(`${API_BASE}/decisions/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewDecision, reviewedBy, notes })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Manual review submission failed');
  return data;
}

export async function retryDecision(id, chaosOverrides = {}) {
  const res = await fetch(`${API_BASE}/decisions/${id}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chaosOverrides })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Retry trigger failed');
  return data;
}

export async function fetchConfigs() {
  const res = await fetch(`${API_BASE}/configs`);
  if (!res.ok) throw new Error('Failed to load workflow configurations');
  return res.json();
}

export async function activateConfig(id) {
  const res = await fetch(`${API_BASE}/configs/${id}/activate`, {
    method: 'PATCH'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Config activation failed');
  return data;
}

