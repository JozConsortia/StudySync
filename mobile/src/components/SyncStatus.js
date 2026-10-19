import { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Text } from 'react-native';
import { useTheme, useThemedStyles } from '../theme';

/** "Synced across your devices · 10:42" */
export function SyncStatus({ syncedAt }) {
  const styles = useThemedStyles(makeStyles);
  const time = syncedAt ? syncedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null;
  return <Text style={styles.status}>Synced across your devices{time ? ` · ${time}` : ''}</Text>;
}

/** Pull-to-refresh control that re-reads history and saved answers from the server. */
export function useSyncRefreshControl(onRefresh) {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh?.();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);
  return <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent} colors={[colors.accent]} />;
}

const makeStyles = (colors) =>
  StyleSheet.create({
    status: { color: colors.success, fontSize: 12, marginTop: 2 },
  });
