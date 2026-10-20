import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme';
import { api } from '../api';
import { localDay } from '../challenges';
import KeyboardAwareScrollView from '../components/KeyboardAware';
import { Card, Gradient, IconTile } from '../components/ui';
import ResetPassword from '../components/ResetPassword';

/** The "Me" tab: profile, learning stats, appearance, password and sign out. */
export default function AccountScreen({ user, active = true, stats: initialStats, onAuth, onSignOut, onOpenChallenges }) {
  const { colors, mode, toggle } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [stats, setStats] = useState(initialStats);
  const [changing, setChanging] = useState(false);

  // Newer numbers from the Daily tab show straight away; the server is asked each time this tab opens.
  useEffect(() => {
    if (initialStats) setStats(initialStats);
  }, [initialStats]);

  useEffect(() => {
    if (!active) return;
    api.challenges
      .stats(localDay())
      .then(setStats)
      .catch(() => {});
  }, [active]);

  const initials = (user.fullName || user.email || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
  const since = user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;

  return (
    <KeyboardAwareScrollView contentContainerStyle={styles.page}>
      <Gradient style={styles.hero}>
        <View style={[styles.ring, { width: 200, height: 200, borderRadius: 100, top: -90, right: -60 }]} />
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <Text style={styles.name}>{user.fullName}</Text>
        <Text style={styles.email}>{user.email}</Text>
        {since && <Text style={styles.since}>Studying with StudySync since {since}</Text>}
      </Gradient>

      <Pressable onPress={onOpenChallenges}>
        <Card style={{ gap: 14 }}>
          <View style={styles.rowHead}>
            <Text style={styles.cardTitle}>Your progress</Text>
            <View style={{ flex: 1 }} />
            <Text style={styles.link}>Daily challenges</Text>
            <Feather name="chevron-right" size={16} color={colors.accent} />
          </View>
          <View style={styles.grid}>
            <Stat emoji="⭐" value={stats ? `Level ${stats.level}` : '–'} label={stats ? `${stats.xp} XP` : 'XP'} />
            <Stat emoji="🔥" value={stats ? stats.streak : '–'} label="day streak" />
            <Stat emoji="🏆" value={stats ? stats.bestStreak : '–'} label="best streak" />
            <Stat emoji="📅" value={stats ? stats.daysCompleted : '–'} label={stats?.daysCompleted === 1 ? 'day completed' : 'days completed'} />
          </View>
          {stats && (
            <View style={{ gap: 6 }}>
              <Text style={styles.small}>
                {stats.levelXp} / {stats.xpPerLevel} XP to level {stats.level + 1}
              </Text>
              <View style={styles.track}>
                <Gradient style={[styles.fill, { width: `${(stats.levelXp / stats.xpPerLevel) * 100}%` }]} />
              </View>
            </View>
          )}
        </Card>
      </Pressable>

      <Card style={{ gap: 4, paddingVertical: 8 }}>
        <Row icon="moon" tone="violet" title="Dark mode" subtitle="Easier on the eyes at night">
          <Switch
            value={mode === 'dark'}
            onValueChange={toggle}
            trackColor={{ true: colors.accent, false: colors.borderStrong }}
            thumbColor="#fff"
          />
        </Row>
        <View style={styles.divider} />
        <Row
          icon="key"
          tone="cyan"
          title="Change password"
          subtitle="We'll email you a code"
          onPress={() => setChanging((v) => !v)}
          chevron={changing ? 'chevron-up' : 'chevron-down'}
        />
        {changing && (
          <View style={styles.reset}>
            <ResetPassword
              initialEmail={user.email}
              lockEmail
              onCancel={() => setChanging(false)}
              onDone={async (session) => {
                await onAuth(session);
                setChanging(false);
                Alert.alert('Password changed', 'Use your new password next time you sign in.');
              }}
            />
          </View>
        )}
        <View style={styles.divider} />
        <Row icon="log-out" tone="pink" title="Sign out" subtitle="You can sign back in any time" onPress={onSignOut} danger />
      </Card>
    </KeyboardAwareScrollView>
  );
}

function Stat({ emoji, value, label }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.stat}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ icon, tone, title, subtitle, onPress, chevron = 'chevron-right', danger, children }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <IconTile icon={icon} tone={tone} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, danger && { color: colors.danger }]}>{title}</Text>
        <Text style={styles.small}>{subtitle}</Text>
      </View>
      {children || (onPress && <Feather name={chevron} size={18} color={colors.muted} />)}
    </Pressable>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    page: { padding: 16, paddingTop: 8, gap: 14, paddingBottom: 40 },
    hero: { borderRadius: 28, padding: 22, alignItems: 'center', gap: 4, overflow: 'hidden' },
    ring: { position: 'absolute', borderWidth: 24, borderColor: 'rgba(255,255,255,0.07)' },
    avatar: {
      width: 84,
      height: 84,
      borderRadius: 42,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(10, 8, 40, 0.28)',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.5)',
      marginBottom: 8,
    },
    avatarText: { color: '#fff', fontSize: 30, fontWeight: '900' },
    name: { color: '#fff', fontSize: 23, fontWeight: '800' },
    email: { color: 'rgba(255,255,255,0.88)', fontSize: 14 },
    since: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 6 },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
    link: { color: colors.accent, fontWeight: '700', fontSize: 13 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    stat: { flexBasis: '47%', flexGrow: 1, padding: 14, borderRadius: 18, backgroundColor: colors.surface2, gap: 2 },
    statEmoji: { fontSize: 20 },
    statValue: { color: colors.text, fontSize: 20, fontWeight: '800', marginTop: 4 },
    statLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
    small: { color: colors.muted, fontSize: 12.5 },
    track: { height: 8, borderRadius: 8, backgroundColor: colors.surface3, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    rowTitle: { color: colors.text, fontSize: 15.5, fontWeight: '700' },
    divider: { height: 1, backgroundColor: colors.border },
    reset: { paddingVertical: 10 },
  });
