import { requirePageAuth } from '@/lib/auth/server';
import { ChatClient } from '@/components/dashboard/ChatClient';

export default async function ChatPage() {
  const user = await requirePageAuth('chat:use');
  return <ChatClient userName={user.nominativo} />;
}
