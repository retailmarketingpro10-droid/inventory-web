/** Support contact — opens the user's default email client (no backend mail server). */

export const SUPPORT_EMAIL = 'retailmarketingpro1.0@gmail.com';

export const APP_NAME =
  import.meta.env.VITE_APP_NAME?.trim() || 'Inventory Migrator';

export const APP_VERSION =
  import.meta.env.VITE_APP_VERSION?.trim() || '1.0.0';

export type SupportEmailTopic =
  | 'support'
  | 'cancellation'
  | 'billing'
  | 'payment'
  | 'account_deletion';

export interface SupportEmailParams {
  userId?: string;
  userEmail?: string;
  extraBody?: string;
  transactionId?: string;
}

function getWebDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Web';
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';

  let os = 'Unknown OS';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return `Web — ${browser} on ${os}`;
}

function subjectForTopic(topic: SupportEmailTopic, transactionId?: string): string {
  switch (topic) {
    case 'cancellation':
      return `[${APP_NAME}] Subscription Cancellation Request - v${APP_VERSION}`;
    case 'billing':
      return `[${APP_NAME}] Billing Support - v${APP_VERSION}`;
    case 'payment':
      return `[${APP_NAME}] Payment Issue - v${APP_VERSION}${transactionId ? ` - ${transactionId}` : ''}`;
    case 'account_deletion':
      return `[${APP_NAME}] Account Deletion Request - v${APP_VERSION}`;
    default:
      return `[${APP_NAME}] Support Request - v${APP_VERSION}`;
  }
}

function bodyForTopic(topic: SupportEmailTopic, params: SupportEmailParams): string {
  const device = getWebDeviceLabel();
  const lines: string[] = [];

  switch (topic) {
    case 'cancellation':
      lines.push(
        'I would like to cancel my subscription. Please process my cancellation request.',
        ''
      );
      break;
    case 'account_deletion':
      lines.push(
        'Please delete my account and all associated data.',
        '',
        'Registered Email:',
        'Full Name:',
        '',
        'I confirm that I want to permanently delete my account.',
        ''
      );
      break;
    case 'payment':
      lines.push(
        'I need help with a payment issue.',
        '',
        params.transactionId ? `Transaction ID: ${params.transactionId}` : '',
        ''
      );
      break;
    default:
      lines.push('Please describe your issue below.', '');
  }

  lines.push(
    `User ID: ${params.userId || 'Not signed in'}`,
    `Registered Email: ${params.userEmail || '—'}`,
    `Device: ${device}`,
    `App Version: ${APP_VERSION}`,
    'Platform: Web',
    ''
  );

  if (topic === 'cancellation') {
    lines.push(
      'Reason for cancellation (optional):',
      '',
      'I understand access continues until the end of my current billing period unless stated otherwise.',
      ''
    );
  }

  if (params.extraBody?.trim()) {
    lines.push('---', params.extraBody.trim(), '');
  }

  return lines.join('\n');
}

export function buildSupportMailtoUrl(
  topic: SupportEmailTopic = 'support',
  params: SupportEmailParams = {}
): string {
  const subject = subjectForTopic(topic, params.transactionId);
  const body = bodyForTopic(topic, params);
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Opens Gmail, Outlook, Apple Mail, etc. per the user's system default. */
export function openSupportEmail(
  topic: SupportEmailTopic = 'support',
  params: SupportEmailParams = {}
): void {
  window.location.href = buildSupportMailtoUrl(topic, params);
}
