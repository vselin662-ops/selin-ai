export async function adminApi(url: string, options: RequestInit = {}): Promise<any> {
  let token = localStorage.getItem('selin_admin_token');
  
  const performLogin = async () => {
    try {
      const loginRes = await fetch('/api/admin/login', { method: 'POST' });
      const loginData = await loginRes.json();
      if (loginData.token) {
        localStorage.setItem('selin_admin_token', loginData.token);
        return loginData.token;
      }
    } catch (e) {
      console.warn('Auto-login failed', e);
    }
    return null;
  };

  if (!token) {
    token = await performLogin();
  }

  const sendRequest = async (currentStrToken: string | null) => {
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${currentStrToken || 'no-token'}`,
    } as Record<string, string>;
    return fetch(url, { ...options, headers });
  };

  try {
    let response = await sendRequest(token);
    
    // Если получили 401, пробуем обновить токен один раз
    if (response.status === 401) {
      console.log('🔄 Token expired, retrying login...');
      token = await performLogin();
      response = await sendRequest(token);
    }
    
    return response;
  } catch (err) {
    throw err;
  }
}
