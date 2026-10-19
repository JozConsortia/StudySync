import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme';
import { api } from '../api';
import { firstOpen, localDay, outcome, untilMidnight } from '../challenges';
import KeyboardAwareScrollView from '../components/KeyboardAware';
import { Button, Card, Chip, ErrorBox, Gradient } from '../components/ui';
import { BotAvatar, BotMessage } from '../components/Bot';
import { MicButton } from '../components/VoiceButtons';
import RichText from '../components/RichText';

const LETTERS = ['A', 'B', 'C', 'D'];

export default function ChallengesScreen({ onStats }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [day, setDay] = useState(localDay());
  const [data, setData] = useState(null); // { challenge, stats }
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const scrollRef = useRef(null);

  const apply = useCallback(
    (res, { jump = false } = {}) => {
      setData(res);
      onStats?.(res.stats);
      if (jump) setIndex(firstOpen(res.challenge.items));
    },
    [onStats]
  );

  const load = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      apply(await api.challenges.today(day), { jump: true });
      setStatus('ready');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [day, apply]);

  useEffect(() => {
    setReviewing(false);
    load();
  }, [load]);

  // A new day started while the app was in the background: fetch the new challenges.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && setDay(localDay()));
    return () => sub.remove();
  }, []);

  if (status === 'loading' && !data) return <Preparing />;
  if (status === 'error' && !data) {
    return (
      <View style={styles.center}>
        <BotAvatar size={64} />
        <Text style={styles.centerTitle}>Couldn't load today's challenges</Text>
        <ErrorBox message={error} />
        <Button title="Try again" icon="rotate-ccw" variant="primary" onPress={load} />
      </View>
    );
  }

  const { challenge, stats } = data;
  const items = challenge.items;
  const item = items[Math.min(index, items.length - 1)];
  const showSummary = challenge.completed && !reviewing;

  const goTo = (i) => {
    setIndex(i);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <KeyboardAwareScrollView ref={scrollRef} contentContainerStyle={styles.page}>
      <Hero challenge={challenge} stats={stats} index={index} onPick={(i) => { setReviewing(true); goTo(i); }} />

      {showSummary ? (
        <Summary challenge={challenge} stats={stats} onReview={() => { setReviewing(true); goTo(0); }} />
      ) : (
        <ChallengeCard
          key={`${challenge.day}:${item.id}`}
          day={challenge.day}
          item={item}
          position={items.indexOf(item)}
          total={items.length}
          onAnswered={(res) => {
            // Stay on this challenge to show its result, even when it was the last one.
            setReviewing(true);
            apply(res);
          }}
          onPrev={index > 0 ? () => goTo(index - 1) : null}
          onNext={() => {
            if (challenge.completed) {
              setReviewing(false);
              goTo(index);
              return;
            }
            // The next unanswered challenge, wrapping round to any skipped earlier.
            const after = items.findIndex((c, i) => i > index && !c.result);
            goTo(after !== -1 ? after : firstOpen(items));
          }}
          allDone={challenge.completed}
        />
      )}

      <WeekCard stats={stats} />
    </KeyboardAwareScrollView>
  );
}

function Preparing() {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.center}>
      <View style={styles.prepBot}>
        <BotAvatar size={76} thinking />
      </View>
      <Text style={styles.centerTitle}>Preparing today's challenges…</Text>
      <Text style={styles.centerSub}>
        I'm picking fresh questions from the subjects you've been studying. This takes a few seconds, once a day.
      </Text>
    </View>
  );
}

function Hero({ challenge, stats, index, onPick }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const date = new Date(`${challenge.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const dotColor = { correct: colors.success, partly: colors.warning, incorrect: colors.danger };
  return (
    <Gradient style={styles.hero}>
      <View style={[styles.ring, { width: 200, height: 200, borderRadius: 100, top: -90, right: -60 }]} />
      <Text style={styles.heroKicker}>DAILY CHALLENGE · {date.toUpperCase()}</Text>
      <Text style={styles.heroTitle}>{challenge.completed ? 'All done for today!' : 'Five challenges. One streak.'}</Text>

      <View style={styles.heroStats}>
        <View style={styles.heroStat}>
          <Text style={styles.heroEmoji}>🔥</Text>
          <View>
            <Text style={styles.heroValue}>{stats.streak}</Text>
            <Text style={styles.heroLabel}>day streak</Text>
          </View>
        </View>
        <View style={styles.heroStat}>
          <Text style={styles.heroEmoji}>⭐</Text>
          <View>
            <Text style={styles.heroValue}>Level {stats.level}</Text>
            <Text style={styles.heroLabel}>{stats.xp} XP total</Text>
          </View>
        </View>
      </View>

      <View style={{ gap: 6 }}>
        <View style={styles.xpRow}>
          <Text style={styles.heroLabel}>
            {stats.levelXp} / {stats.xpPerLevel} XP to level {stats.level + 1}
          </Text>
          <Text style={styles.heroLabel}>
            {challenge.score} / {challenge.maxScore} today
          </Text>
        </View>
        <View style={styles.xpTrack}>
          <View style={[styles.xpFill, { width: `${(stats.levelXp / stats.xpPerLevel) * 100}%` }]} />
        </View>
      </View>

      <View style={styles.dots}>
        {challenge.items.map((c, i) => {
          const o = outcome(c);
          return (
            <Pressable
              key={c.id}
              onPress={() => onPick(i)}
              hitSlop={6}
              accessibilityLabel={`Challenge ${i + 1}${o ? `, ${o}` : ''}`}
              style={[styles.dot, o && { backgroundColor: dotColor[o], borderColor: dotColor[o] }, i === index && styles.dotCurrent]}
            >
              {o ? (
                <Feather name={o === 'incorrect' ? 'x' : 'check'} size={13} color="#fff" />
              ) : (
                <Text style={styles.dotText}>{i + 1}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </Gradient>
  );
}

function ChallengeCard({ day, item, position, total, onAnswered, onPrev, onNext, allDone }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [choice, setChoice] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const voiceBase = useRef('');
  const result = item.result;
  const o = outcome(item);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      onAnswered(await api.challenges.answer(day, item.id, item.type === 'mcq' ? { choice } : { answer: draft }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verdictColor = { correct: colors.success, partly: colors.warning, incorrect: colors.danger }[o];

  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.counter}>
          Challenge {position + 1} of {total}
        </Text>
        <View style={{ flex: 1 }} />
        <Chip tone="accent" icon="zap" label={`+${item.points} XP`} />
      </View>
      <View style={styles.chips}>
        <Chip icon="book-open" label={item.subject} />
        <Chip icon={item.type === 'mcq' ? 'list' : 'edit-3'} label={item.type === 'mcq' ? 'Multiple choice' : 'Short answer'} />
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <RichText text={item.question} style={styles.question} />

      {item.type === 'mcq' ? (
        <View style={{ gap: 10 }}>
          {item.options.map((opt, i) => {
            const picked = result ? result.choice === i : choice === i;
            const isAnswer = result && item.answerIndex === i;
            const wrongPick = result && picked && !isAnswer;
            return (
              <Pressable
                key={i}
                disabled={!!result || busy}
                onPress={() => setChoice(i)}
                style={({ pressed }) => [
                  styles.option,
                  picked && !result && styles.optionPicked,
                  isAnswer && styles.optionRight,
                  wrongPick && styles.optionWrong,
                  pressed && { transform: [{ scale: 0.98 }] },
                ]}
              >
                <View
                  style={[
                    styles.letter,
                    picked && !result && { backgroundColor: colors.accent, borderColor: colors.accent },
                    isAnswer && { backgroundColor: colors.success, borderColor: colors.success },
                    wrongPick && { backgroundColor: colors.danger, borderColor: colors.danger },
                  ]}
                >
                  {isAnswer ? (
                    <Feather name="check" size={14} color="#fff" />
                  ) : wrongPick ? (
                    <Feather name="x" size={14} color="#fff" />
                  ) : (
                    <Text style={[styles.letterText, picked && { color: '#fff' }]}>{LETTERS[i]}</Text>
                  )}
                </View>
                <Text style={styles.optionText}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : result ? (
        <View style={styles.yourAnswer}>
          <Text style={styles.smallLabel}>YOUR ANSWER</Text>
          <Text style={styles.answerText}>{result.answer}</Text>
        </View>
      ) : (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={4000}
            editable={!busy}
            placeholder="Type your answer here…"
            placeholderTextColor={colors.muted}
          />
          <View style={styles.composerRow}>
            <MicButton
              onStart={() => {
                voiceBase.current = draft.trimEnd();
                setError('');
              }}
              onText={(text) => setDraft(voiceBase.current ? `${voiceBase.current} ${text}` : text)}
              onError={setError}
            />
            <Text style={styles.counterSmall}>{draft.trim() ? `${draft.trim().split(/\s+/).length} words` : ''}</Text>
          </View>
        </View>
      )}

      {busy && item.type === 'short' && <BotMessage thinking label="Marking your answer" />}
      <ErrorBox message={error} />

      {!result && (
        <Button
          title={item.type === 'mcq' ? 'Check answer' : 'Submit answer'}
          icon="check-circle"
          variant="primary"
          size="lg"
          onPress={submit}
          loading={busy}
          disabled={item.type === 'mcq' ? choice === null : !draft.trim()}
        />
      )}

      {result && <ResultPanel item={item} result={result} color={verdictColor} verdict={o} />}

      <View style={styles.nav}>
        {onPrev ? <Button title="Previous" icon="arrow-left" variant="ghost" size="sm" onPress={onPrev} /> : <View />}
        {result && (
          <Button
            title={allDone ? "See today's rating" : 'Next challenge'}
            icon={allDone ? 'award' : 'arrow-right'}
            variant="primary"
            size="sm"
            onPress={onNext}
          />
        )}
      </View>
    </Card>
  );
}

function ResultPanel({ item, result, color, verdict }) {
  const styles = useThemedStyles(makeStyles);
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
  }, [pop]);

  const headline = { correct: 'Correct! 🎉', partly: 'Nearly there 👍', incorrect: 'Not quite' }[verdict];
  return (
    <View style={{ gap: 10 }}>
      <Animated.View style={[styles.resultHead, { borderColor: color, transform: [{ scale: pop }] }]}>
        <View style={[styles.scoreBubble, { backgroundColor: color }]}>
          <Text style={styles.scoreText}>{item.type === 'mcq' ? (result.correct ? '10' : '0') : result.outOf10}</Text>
          <Text style={styles.scoreOf}>/10</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.resultTitle, { color }]}>{headline}</Text>
          <Text style={styles.resultSub}>+{result.score} XP earned</Text>
        </View>
      </Animated.View>
      {!!result.feedback && (
        <BotMessage>
          <Text style={styles.body}>{result.feedback}</Text>
        </BotMessage>
      )}
      {!!item.modelAnswer && (
        <View style={styles.explain}>
          <Text style={styles.smallLabel}>MODEL ANSWER</Text>
          <RichText text={item.modelAnswer} style={styles.body} />
        </View>
      )}
      {!!item.explanation && (
        <View style={styles.explain}>
          <Text style={styles.smallLabel}>WHY</Text>
          <RichText text={item.explanation} style={styles.body} />
        </View>
      )}
    </View>
  );
}

function Stars({ count, size = 30 }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Text key={n} style={{ fontSize: size, color: n <= count ? colors.warning : colors.borderStrong }}>
          ★
        </Text>
      ))}
    </View>
  );
}

function Summary({ challenge, stats, onReview }) {
  const styles = useThemedStyles(makeStyles);
  const [countdown, setCountdown] = useState(untilMidnight());
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = setInterval(() => setCountdown(untilMidnight()), 30000);
    Animated.timing(spin, { toValue: 1, duration: 700, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
    return () => clearInterval(t);
  }, [spin]);

  const r = challenge.rating;
  return (
    <Card style={[styles.card, { alignItems: 'center' }]}>
      <Text style={styles.smallLabel}>TODAY'S RATING</Text>
      <Animated.View style={{ transform: [{ scale: spin }] }}>
        <Stars count={r.stars} size={38} />
      </Animated.View>
      <Text style={styles.ratingLabel}>{r.label}</Text>
      <Text style={styles.ratingScore}>
        {challenge.score} / {challenge.maxScore} points · {r.percent}%
      </Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryValue}>+{challenge.score}</Text>
          <Text style={styles.summaryLabel}>XP today</Text>
        </View>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryValue}>🔥 {stats.streak}</Text>
          <Text style={styles.summaryLabel}>day streak</Text>
        </View>
        <View style={styles.summaryStat}>
          <Text style={styles.summaryValue}>{stats.bestStreak}</Text>
          <Text style={styles.summaryLabel}>best streak</Text>
        </View>
      </View>
      <Text style={styles.centerSub}>New challenges in {countdown}. Come back tomorrow to keep your streak alive!</Text>
      <Button title="Review today's answers" icon="eye" size="sm" onPress={onReview} />
    </Card>
  );
}

function WeekCard({ stats }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const today = localDay();
  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Your week</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.counterSmall}>
          {stats.daysCompleted} {stats.daysCompleted === 1 ? 'day' : 'days'} completed
        </Text>
      </View>
      <View style={styles.week}>
        {stats.week.map((d) => {
          const pct = d.maxScore ? d.score / d.maxScore : 0;
          const isToday = d.day === today;
          return (
            <View key={d.day} style={styles.weekCol}>
              <Text style={styles.weekStars}>{d.completed ? `${d.stars}★` : ''}</Text>
              <View style={styles.weekTrack}>
                {d.score > 0 && (
                  <Gradient
                    style={[styles.weekFill, { height: `${Math.max(8, pct * 100)}%` }]}
                    colors={d.completed ? undefined : [colors.borderStrong, colors.borderStrong]}
                  />
                )}
              </View>
              <Text style={[styles.weekDay, isToday && { color: colors.accent }]}>
                {new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    page: { padding: 16, paddingTop: 8, gap: 14, paddingBottom: 40 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 },
    prepBot: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentSoft,
      borderWidth: 1,
      borderColor: colors.accentBorder,
    },
    centerTitle: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
    centerSub: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },

    hero: { borderRadius: 28, padding: 20, gap: 14, overflow: 'hidden' },
    ring: { position: 'absolute', borderWidth: 24, borderColor: 'rgba(255,255,255,0.07)' },
    heroKicker: { color: 'rgba(255,255,255,0.85)', fontSize: 11.5, fontWeight: '800', letterSpacing: 1 },
    heroTitle: { color: '#fff', fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.4 },
    heroStats: { flexDirection: 'row', gap: 10 },
    heroStat: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 12,
      borderRadius: 18,
      backgroundColor: 'rgba(10, 8, 40, 0.22)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    heroEmoji: { fontSize: 24 },
    heroValue: { color: '#fff', fontSize: 17, fontWeight: '800' },
    heroLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
    xpRow: { flexDirection: 'row', justifyContent: 'space-between' },
    xpTrack: { height: 8, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
    xpFill: { height: '100%', borderRadius: 8, backgroundColor: '#fff' },
    dots: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
    dot: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.14)',
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.35)',
    },
    dotCurrent: { borderColor: '#fff', transform: [{ scale: 1.12 }] },
    dotText: { color: '#fff', fontWeight: '800', fontSize: 14 },

    card: { gap: 14 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
    counter: { color: colors.muted, fontSize: 13, fontWeight: '700' },
    counterSmall: { color: colors.muted, fontSize: 12, fontWeight: '600' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    title: { color: colors.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
    question: { color: colors.text, fontSize: 16, lineHeight: 24 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: colors.border,
      backgroundColor: colors.surface2,
    },
    optionPicked: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
    optionRight: { borderColor: colors.success, backgroundColor: colors.successSoft },
    optionWrong: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
    letter: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: colors.borderStrong,
    },
    letterText: { color: colors.textSoft, fontWeight: '800', fontSize: 13 },
    optionText: { flex: 1, color: colors.text, fontSize: 15, lineHeight: 21 },
    composer: { borderRadius: 18, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.inputBg, padding: 6 },
    input: {
      minHeight: 110,
      paddingHorizontal: 10,
      paddingTop: 8,
      color: colors.text,
      fontSize: 15,
      lineHeight: 22,
      textAlignVertical: 'top',
    },
    composerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 4 },
    yourAnswer: { gap: 4, padding: 14, borderRadius: 16, backgroundColor: colors.surface2 },
    answerText: { color: colors.text, fontSize: 15, lineHeight: 22 },
    smallLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
    resultHead: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 18, borderWidth: 1.5, backgroundColor: colors.surface2 },
    scoreBubble: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
    scoreText: { color: '#fff', fontSize: 22, fontWeight: '900' },
    scoreOf: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '800', marginTop: 8 },
    resultTitle: { fontSize: 18, fontWeight: '800' },
    resultSub: { color: colors.muted, fontSize: 13, fontWeight: '600', marginTop: 2 },
    explain: { gap: 6, padding: 14, borderRadius: 16, backgroundColor: colors.cyanSoft },
    body: { color: colors.textSoft, fontSize: 14.5, lineHeight: 21 },
    nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

    ratingLabel: { color: colors.text, fontSize: 24, fontWeight: '800' },
    ratingScore: { color: colors.muted, fontSize: 14, fontWeight: '600' },
    summaryRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
    summaryStat: { flex: 1, alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: colors.surface2 },
    summaryValue: { color: colors.text, fontSize: 19, fontWeight: '800' },
    summaryLabel: { color: colors.muted, fontSize: 12, fontWeight: '600', marginTop: 2 },

    week: { flexDirection: 'row', justifyContent: 'space-between', height: 130 },
    weekCol: { flex: 1, alignItems: 'center', gap: 6 },
    weekStars: { color: colors.warning, fontSize: 11, fontWeight: '800', height: 14 },
    weekTrack: { flex: 1, width: 18, borderRadius: 9, backgroundColor: colors.surface2, justifyContent: 'flex-end', overflow: 'hidden' },
    weekFill: { width: '100%', borderRadius: 9 },
    weekDay: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  });
