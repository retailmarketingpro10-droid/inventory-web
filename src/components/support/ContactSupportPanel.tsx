import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Mail, LifeBuoy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  openSupportEmail,
  SUPPORT_EMAIL,
  APP_NAME,
  APP_VERSION,
  type SupportEmailTopic,
} from '@/lib/supportEmail';

interface ContactSupportPanelProps {
  topic?: SupportEmailTopic;
  title?: string;
  description?: string;
  showMessageField?: boolean;
  messagePlaceholder?: string;
  userId?: string;
  userEmail?: string;
  transactionId?: string;
  className?: string;
}

export function ContactSupportPanel({
  topic = 'support',
  title = 'Contact support',
  description = `Opens your default email app (Gmail, Outlook, Apple Mail, etc.) with your details pre-filled. We reply at ${SUPPORT_EMAIL}.`,
  showMessageField = true,
  messagePlaceholder = 'Describe your issue here — it will be included in the email body…',
  userId: userIdProp,
  userEmail: userEmailProp,
  transactionId,
  className = '',
}: ContactSupportPanelProps) {
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState(userIdProp);
  const [userEmail, setUserEmail] = useState(userEmailProp);

  useEffect(() => {
    if (userIdProp !== undefined) setUserId(userIdProp);
    if (userEmailProp !== undefined) setUserEmail(userEmailProp);
  }, [userIdProp, userEmailProp]);

  useEffect(() => {
    if (userIdProp !== undefined && userEmailProp !== undefined) return;
    supabase.auth.getUser().then(({ data }) => {
      if (!userIdProp && data.user?.id) setUserId(data.user.id);
      if (!userEmailProp && data.user?.email) setUserEmail(data.user.email);
    });
  }, [userIdProp, userEmailProp]);

  const handleOpen = () => {
    openSupportEmail(topic, {
      userId,
      userEmail,
      extraBody: message.trim() || undefined,
      transactionId,
    });
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-start gap-3">
        <LifeBuoy className="h-6 w-6 text-primary shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-lg">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {APP_NAME} v{APP_VERSION}
            {userId ? ` · User ID: ${userId.slice(0, 8)}…` : ''}
          </p>
        </div>
      </div>

      {showMessageField && (
        <div className="space-y-2">
          <Label htmlFor="support-message">Your message (optional)</Label>
          <Textarea
            id="support-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={messagePlaceholder}
            rows={4}
            className="resize-y"
          />
        </div>
      )}

      <Button type="button" className="w-full h-12 text-base font-semibold" onClick={handleOpen}>
        <Mail className="h-5 w-5 mr-2" />
        Contact support
      </Button>

      <p className="text-xs text-center text-muted-foreground">
        No email server in the app — your device sends the message to{' '}
        <span className="font-medium">{SUPPORT_EMAIL}</span>
      </p>
    </div>
  );
}
