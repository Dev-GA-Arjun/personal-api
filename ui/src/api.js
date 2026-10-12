export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function requestJson(path, token, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...options.headers,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`
    }
  });

  let body;
  try {
    body = await response.json();
  } catch {
    throw new ApiError('The server returned an unreadable response.', response.status);
  }

  if (!response.ok) {
    const message = body && typeof body.error === 'string'
      ? body.error
      : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return body;
}
