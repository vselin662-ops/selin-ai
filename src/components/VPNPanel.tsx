import React, { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldAlert, Activity, Database, Globe, Lock, Power, RefreshCw, Zap, Users, UserPlus, Copy, Trash2, Key, ChevronRight, QrCode, Download, Share2, ExternalLink as ExternalIcon, X, Smartphone, Check } from 'lucide-react';
import { adminApi } from '../lib/adminApi';
import { ProtocolGenerator } from '../services/network/ProtocolGenerator';
import QRCode from 'qrcode';

interface VPNStatus {
  active: boolean;
  port: number;
  connections: number;
  uptime: number;
  bytesIn: number;
  bytesOut: number;
}

interface VPNClients {
  id: string;
  client_name: string;
  username: string;
  password: string;
  uuid?: string;
  plan: string;
  status: string;
  bytes_used: number;
  created_at: string;
}

export const VPNPanel: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'status' | 'clients'>('status');
  const [status, setStatus] = useState<VPNStatus | null>(null);
  const [clients, setClients] = useState<VPNClients[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [targetPort, setTargetPort] = useState(1080);
  const [serverHost, setServerHost] = useState('176.108.252.111');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  
  const [showQRModal, setShowQRModal] = useState<VPNClients | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const fetchStatus = async () => {
    try {
      const res = await adminApi('/api/admin/vpn-status');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          setStatus(data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch VPN status', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await adminApi('/api/admin/vpn-clients');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          setClients(data.clients || []);
        }
      }
    } catch (err) {
      console.error('Failed to fetch VPN clients', err);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchClients();
    const interval = setInterval(() => {
      fetchStatus();
      if (activeSubTab === 'clients') fetchClients();
    }, 3000);
    return () => clearInterval(interval);
  }, [activeSubTab]);

  const generateVlessLink = (client: VPNClients) => {
    const uuid = client.uuid || 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
    return ProtocolGenerator.generateVLESS({
      uuid,
      serverIp: serverHost || '176.108.252.111',
      port: 3000,
      clientName: client.client_name || 'Vasya'
    });
  };

  const generateShadowsocksLink = (client: VPNClients) => {
    return ProtocolGenerator.generateShadowsocks({
      method: 'chacha20-ietf-poly1305',
      password: client.password,
      serverIp: serverHost || '176.108.252.111',
      port: 8388,
      clientName: client.client_name || 'Vasya'
    });
  };

  const generateSocksLink = (client: VPNClients) => {
    const host = serverHost || window.location.hostname;
    const port = status?.port || 1080;
    const name = encodeURIComponent(`SelinAI_${client.client_name}`);
    return `socks5://${client.username}:${client.password}@${host}:${port}#${name}`;
  };

  const handleShowQR = async (client: VPNClients) => {
    const link = generateVlessLink(client);
    try {
      const url = await QRCode.toDataURL(link, {
        width: 400,
        margin: 2,
        color: {
          dark: '#0F0D0C',
          light: '#EAE6DF',
        }
      });
      setQrDataUrl(url);
      setShowQRModal(client);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      const newActive = !status?.active;
      await adminApi('/api/admin/vpn-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newActive, port: targetPort })
      });
      await fetchStatus();
    } catch (err) {
      alert('Ошибка при управлении VPN');
    } finally {
      setToggling(false);
    }
  };

  const handleCreateClient = async () => {
    if (!newClientName) return;
    try {
      const res = await adminApi('/api/admin/vpn-clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_name: newClientName })
      });
      if (res.ok) {
        setShowAddModal(false);
        setNewClientName('');
        fetchClients();
      }
    } catch (err) {
      alert('Ошибка создания клиента');
    }
  };

  const handleDeleteClient = async (id: string) => {
    if (!confirm('Удалить доступ для этого клиента?')) return;
    try {
      await adminApi('/api/admin/vpn-clients-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      fetchClients();
    } catch (err) {
      alert('Ошибка удаления');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}ч ${m}м ${s}с`;
  };

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-2" />
        Загрузка конфигурации VPN...
      </div>
    );
  }

  const isActive = status?.active;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Sub Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-900/60 rounded-2xl border border-slate-800 w-fit">
        <button
          onClick={() => setActiveSubTab('status')}
          className={`px-6 py-2 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'status' ? 'bg-[#C5A059] text-[#0F0D0C]' : 'text-slate-400 hover:text-white'
          }`}
        >
          СТАТУС И СЕТЬ
        </button>
        <button
          onClick={() => setActiveSubTab('clients')}
          className={`px-6 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
            activeSubTab === 'clients' ? 'bg-[#C5A059] text-[#0F0D0C]' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          КЛИЕНТЫ (ПРОДАЖИ)
        </button>
      </div>

      {activeSubTab === 'status' ? (
        <>
          {/* Hero Status Card */}
          <div className={`relative overflow-hidden p-6 rounded-3xl border transition-all duration-500 ${
            isActive 
              ? 'bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent border-emerald-500/30 shadow-[0_0_40px_-10px_rgba(16,185,129,0.2)]' 
              : 'bg-slate-900/40 border-slate-800'
          }`}>
            <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className={`p-4 rounded-2xl transition-all duration-500 ${
                  isActive ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40' : 'bg-slate-800 text-slate-500'
                }`}>
                  {isActive ? <ShieldCheck className="w-8 h-8" /> : <Shield className="w-8 h-8" />}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white mb-1">Selin Security Tunnel (SST)</h2>
                  <p className="text-slate-400">
                    {isActive 
                      ? `Туннель активен на порту ${status.port}` 
                      : 'Защищенный туннель не запущен'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {!isActive && (
                  <div className="flex items-center bg-slate-800/50 rounded-xl px-3 py-2 border border-slate-700">
                    <span className="text-xs font-medium text-slate-500 mr-2 uppercase">Port:</span>
                    <input 
                      type="number" 
                      value={targetPort}
                      onChange={(e) => setTargetPort(parseInt(e.target.value))}
                      className="bg-transparent text-white w-16 focus:outline-none font-mono"
                    />
                  </div>
                )}
                <button
                  onClick={handleToggle}
                  disabled={toggling}
                  className={`flex items-center gap-2 px-8 py-3 rounded-2xl font-bold transition-all transform active:scale-95 ${
                    isActive 
                      ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30 hover:bg-rose-500/30' 
                      : 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/40 hover:emerald-600'
                  }`}
                >
                  {toggling ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Power className="w-5 h-5" />
                  )}
                  {isActive ? 'ОСТАНОВИТЬ VPN' : 'ЗАПУСТИТЬ VPN'}
                </button>
              </div>
            </div>
            <div className={`absolute top-0 right-0 w-64 h-64 -mr-20 -mt-20 rounded-full blur-3xl opacity-20 transition-all duration-1000 ${
              isActive ? 'bg-emerald-500' : 'bg-slate-500'
            }`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <MetricCard icon={<Activity className="w-4 h-4" />} label="Подключения" value={status?.connections?.toString() || '0'} color="blue" />
            <MetricCard icon={<Zap className="w-4 h-4" />} label="Uptime" value={status ? formatUptime(status.uptime) : '00:00:00'} color="emerald" />
            <MetricCard icon={<Database className="w-4 h-4" />} label="Входящий трафик" value={status ? formatBytes(status.bytesIn) : '0 B'} color="amber" />
            <MetricCard icon={<Globe className="w-4 h-4" />} label="Исходящий трафик" value={status ? formatBytes(status.bytesOut) : '0 B'} color="purple" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center gap-3 mb-6">
                <Lock className="w-5 h-5 text-emerald-400" />
                <h3 className="text-lg font-bold text-white">Суверенная архитектура</h3>
              </div>
              <ul className="space-y-4">
                <SecurityItem label="Коммерческий биллинг" desc="Автоматический учет трафика для каждого проданного ключа" active={true} />
                <SecurityItem label="Изоляция клиентов" desc="Каждый пользователь имеет уникальные SOCKS5 учетные данные" active={true} />
                <SecurityItem label="Защита от перепродажи" desc="Привязка к сессии и лимит одновременных соединений" active={isActive || false} />
                <SecurityItem label="Neural Shield" desc="Маскировка под обычный HTTPS трафик" active={isActive || false} />
              </ul>
            </div>
            <div className="p-6 rounded-3xl bg-slate-900/60 border border-slate-800">
              <div className="flex items-center gap-3 mb-4">
                <Globe className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">Технология продаж</h3>
              </div>
              <div className="space-y-4 text-slate-400 text-sm leading-relaxed">
                <p>Вы создаете «Ключ доступа» во вкладке Клиенты и передаете его покупателю. Покупатель вставляет эти данные в любой VPN-клиент на смартфоне (Shadowrocket, V2Ray, Telegram).</p>
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-200">
                  <div className="flex items-center gap-2 font-bold mb-1">
                    <Zap className="w-3.5 h-3.5" />
                    Бизнес-модель:
                  </div>
                  Продавайте доступ по подписке. Все доходы идут вам напрямую, так как VPN работает на вашем сервере.
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {/* Clients List Header with Server IP setting */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40 p-4 rounded-2xl border border-slate-800">
            <div>
              <h3 className="text-xl font-bold text-white">Управление доступом (VLESS & Happ)</h3>
              <p className="text-xs text-slate-500">Генерация реальных ключей для Happ, v2rayNG, Shadowrocket</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
                <span className="text-[10px] uppercase font-bold text-slate-400">IP Сервера (ВМ):</span>
                <input
                  type="text"
                  value={serverHost}
                  onChange={(e) => setServerHost(e.target.value)}
                  className="bg-transparent text-emerald-400 text-xs font-mono font-bold focus:outline-none w-32"
                  placeholder="176.108.252.111"
                />
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20"
              >
                <UserPlus className="w-4 h-4" />
                СОЗДАТЬ КЛЮЧ
              </button>
            </div>
          </div>

          {/* Clients Table */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/50 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-6 py-4 font-bold uppercase tracking-wider">Клиент</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wider">Ключи подключения (Happ / VLESS)</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wider">Трафик</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wider">Статус</th>
                  <th className="px-6 py-4 font-bold uppercase tracking-wider">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">
                      У вас пока нет активных продаж. Создайте первый ключ доступа!
                    </td>
                  </tr>
                ) : (
                  clients.map((client) => {
                    const isCopied = copiedId === client.id;
                    const vlessUrl = generateVlessLink(client);

                    return (
                      <tr key={client.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-white">{client.client_name}</div>
                          <div className="text-[10px] text-slate-500 font-mono">UUID: {(client.uuid || client.id).slice(0, 18)}...</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              {/* Main 1-click button for Happ */}
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(vlessUrl);
                                  setCopiedId(client.id);
                                  setTimeout(() => setCopiedId(null), 2500);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
                                  isCopied 
                                    ? 'bg-emerald-500 text-white' 
                                    : 'bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30'
                                }`}
                                title="Скопировать VLESS ссылку для импорта в Happ в 1 клик"
                              >
                                {isCopied ? <Check className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                                {isCopied ? 'СКОПИРОВАНО ДЛЯ HAPP!' : 'СКОПИРОВАТЬ ДЛЯ HAPP (VLESS)'}
                              </button>

                              <button
                                onClick={() => handleShowQR(client)}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700 transition-all font-bold"
                                title="Показать QR-код для сканирования с телефона"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                                QR
                              </button>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono truncate max-w-xs">
                              {vlessUrl.slice(0, 45)}...
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-white font-medium">{formatBytes(client.bytes_used)}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            client.status === 'active' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                          }`}>
                            {client.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleDeleteClient(client.id)}
                              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {showQRModal && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl animate-fade-in">
          <div className="w-full max-w-sm bg-[#EAE6DF] rounded-[40px] p-8 shadow-2xl text-center space-y-6">
            <div className="flex justify-between items-center mb-2">
              <div className="text-left">
                <h4 className="text-2xl font-black text-[#0F0D0C] leading-none uppercase">Selin VPN</h4>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Доступ для: {showQRModal.client_name}</p>
              </div>
              <button onClick={() => setShowQRModal(null)} className="p-2 bg-slate-200 rounded-full text-slate-600 hover:bg-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-white p-6 rounded-[32px] shadow-inner border-4 border-[#0F0D0C]/5 flex justify-center">
              <img src={qrDataUrl} alt="VPN QR Code" className="w-full h-auto" />
            </div>

            <div className="space-y-3">
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(generateVlessLink(showQRModal));
                  alert('VLESS ссылка для Happ скопирована!');
                }}
                className="w-full py-4 rounded-2xl bg-[#0F0D0C] text-[#EAE6DF] font-bold flex items-center justify-center gap-3 hover:scale-[1.02] transition-transform shadow-xl"
              >
                <Share2 className="w-5 h-5" />
                СКОПИРОВАТЬ ДЛЯ HAPP (VLESS)
              </button>
              <div className="p-4 bg-slate-100 rounded-2xl text-[10px] text-slate-500 font-bold uppercase leading-relaxed">
                Отсканируйте QR или вставьте ссылку в приложениях:<br/>
                <span className="text-[#0F0D0C] font-black">Happ, v2rayNG, Shadowrocket, NekoBox, Sing-box</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Client Modal ... same as before */}

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400">
                <Key className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-xl font-bold text-white">Новый доступ VPN</h4>
                <p className="text-xs text-slate-500">Генерация уникального ключа для продажи</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1.5 block">Имя клиента (Вася из Бобруйска)</label>
                <input 
                  type="text" 
                  value={newClientName}
                  onChange={(e) => setNewClientName(e.target.value)}
                  placeholder="Например: Иван Иванов (Месячный)"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700 text-xs text-slate-400 space-y-2">
                <p className="flex items-center gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
                  Логин и пароль будут созданы автоматически.
                </p>
                <p className="flex items-center gap-2">
                  <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
                  Доступ будет активен сразу после создания.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-white text-xs font-bold uppercase tracking-wider hover:bg-slate-700 transition-all"
              >
                ОТМЕНА
              </button>
              <button
                onClick={handleCreateClient}
                disabled={!newClientName}
                className="flex-2 py-3 px-6 rounded-xl bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-emerald-600 transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/20"
              >
                СОЗДАТЬ КЛЮЧ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MetricCard: React.FC<{ icon: React.ReactNode, label: string, value: string, color: string }> = ({ icon, label, value, color }) => {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-400/10',
    emerald: 'text-emerald-400 bg-emerald-400/10',
    amber: 'text-amber-400 bg-amber-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
  };

  return (
    <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 flex flex-col items-center text-center">
      <div className={`p-2 rounded-lg mb-3 ${colorMap[color]}`}>
        {icon}
      </div>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-bold text-white">{value}</div>
    </div>
  );
};

const SecurityItem: React.FC<{ label: string, desc: string, active: boolean }> = ({ label, desc, active }) => (
  <li className="flex items-start gap-4">
    <div className={`mt-1 p-1 rounded-full ${active ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800 text-slate-600'}`}>
      <ShieldCheck className="w-3 h-3" />
    </div>
    <div>
      <div className={`text-sm font-bold ${active ? 'text-white' : 'text-slate-500'}`}>{label}</div>
      <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
    </div>
  </li>
);
