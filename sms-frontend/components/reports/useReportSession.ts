'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '@/app/lib/api';

export function useReportSession() {
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState<{ id: number; name: string }[]>([]);
  const [sessionError, setSessionError] = useState('');
  useEffect(() => {
    let current = true;
    void Promise.allSettled([api.get('/sessions'), api.get('/sessions/active')]).then(([list, active]) => {
      if (!current) return;
      if (list.status === 'rejected' || !list.value.data.length) {
        setSessionError('Academic sessions are unavailable. Reload this page to retry.');
        toast.error('Failed to load report sessions');
        return;
      }
      setSessions(list.value.data);
      setSessionId(String(active.status === 'fulfilled' ? active.value.data.id : list.value.data[0].id));
    });
    return () => { current = false; };
  }, []);
  return { sessionId, setSessionId, sessions, sessionError };
}
