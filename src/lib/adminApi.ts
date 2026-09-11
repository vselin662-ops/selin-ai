export async function adminApi(url: string, options: RequestInit = {}): Promise<any> {
  const token = localStorage.getItem('selin_admin_token') || 'admin-unrestricted';
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
  } as Record<string, string>;

  try {
    const response = await fetch(url, { ...options, headers });
    return response;
  } catch (err) {
    throw err;
  }
}
