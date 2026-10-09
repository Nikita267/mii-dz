import { useEffect, useState } from 'react';
import { getSession, isCloudEnabled, onAuthChange } from '../data/api.js';

/*
 * useAuth — сессия пользователя для UI (ДЗ5, FR-63/FR-66): восстановление
 * через getSession при монтировании + живые обновления через onAuthChange,
 * чтобы вход/выход в любой части приложения менял экраны без перезагрузки.
 * В Mock-режиме (isCloudEnabled() = false) сессии не бывает: session = null,
 * loading мгновенно снимается — гостевой режим по умолчанию.
 */

/**
 * Приводит сессию фасада data/api.js ({user: {id, email}} | null) к компактному
 * контракту этого хука ({userId, email} | null).
 *
 * @param {{user: {id: string, email: null|string}}|null} session сессия фасада.
 * @returns {{userId: string, email: string}|null} сессия для UI либо null.
 */
function toUiSession(session) {
  const user = session && session.user ? session.user : null;
  return user ? { userId: user.id, email: user.email || '' } : null;
}

/**
 * Хук сессии аутентификации. Состояние loading обязательно (правило 5
 * CLAUDE.md): восстановление сессии — асинхронная операция, UI не должен
 * мигать формой входа перед уже открытым входом.
 *
 * @returns {{session: {userId: string, email: string}|null, loading: boolean,
 *   cloudEnabled: boolean}} сессия (null — гость), флаг загрузки восстановления
 *   и признак настроенного облака.
 */
export default function useAuth() {
  const cloudEnabled = isCloudEnabled();
  const [session, setSession] = useState(null);
  // В Mock-режиме проверять нечего — грузимся только при включённом облаке.
  const [loading, setLoading] = useState(cloudEnabled);

  useEffect(() => {
    // Mock-режим: сессии не бывает — выходим сразу. Начальные значения
    // состояния уже правильные (session = null, loading = cloudEnabled),
    // поэтому синхронные сбросы setState здесь не нужны.
    if (!cloudEnabled) {
      return undefined;
    }
    let alive = true;
    getSession()
      .then((restored) => {
        if (alive) setSession(toUiSession(restored));
      })
      .catch(() => {
        // сессию не удалось проверить — остаёмся в гостевом режиме, без краха UI
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    const unsubscribe = onAuthChange((nextSession) => {
      if (alive) setSession(toUiSession(nextSession));
    });
    return () => {
      alive = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [cloudEnabled]);

  return { session, loading, cloudEnabled };
}
