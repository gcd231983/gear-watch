// Decides when to notify and sends notifications as GitHub issues
// (the GitHub app turns new issues and comments into phone notifications).
import { money } from './text.mjs';

export const SOURCE_DOWN_AFTER = 3; // failed checks in a row before you hear about it

const SOURCE_LABELS = {
  'apple-refurb': 'Apple Refurbished',
  rss: 'deal feed',
  'rss-search': 'deal search'
};

// Pure: returns the actions to take. Nothing is sent and history is not changed here.
export function planAlerts(history, items, sources) {
  const actions = [];
  for (const item of items) {
    const rec = history.items[item.id];
    const best = rec?.best;
    const key = 'price:' + item.id;
    const a = history.alerts[key];
    if (best && best.price <= item.target) {
      if (!a?.active) actions.push({ kind: 'price', mode: 'new', key, item, best });
      else if (best.price < a.price) actions.push({ kind: 'price', mode: 'lower', key, item, best });
    } else if (a?.active) {
      actions.push({ kind: 'price-clear', key });
    }
  }
  for (const s of sources) {
    const st = history.sources[s.id];
    const key = 'source:' + s.id;
    const a = history.alerts[key];
    if (st && st.failStreak >= SOURCE_DOWN_AFTER && !a?.open) actions.push({ kind: 'source-down', key, source: s, state: st });
    if (st && st.ok && a?.open) actions.push({ kind: 'source-up', key, source: s });
  }
  return actions;
}

function priceTitle(item, best) {
  return `${item.name} is ${money(best.price)}, under your ${money(item.target)} target`;
}

function priceBody(item, best, ctx, variant) {
  const where = best.kind === 'refurb' ? 'Apple Certified Refurbished' : ctx.sourceName(best.source);
  const lead = {
    first: `**${money(best.price)}** right now. Apple's price is ${money(item.price)}.`,
    lower: `It dropped again, to **${money(best.price)}**.`,
    back: `It's back under your target at **${money(best.price)}**.`
  }[variant];
  return [
    lead,
    '',
    `> ${best.title}`,
    '',
    `Found on ${where}.${best.url ? ` [Open the deal](${best.url})` : ''}`,
    '',
    `[See everything Gear Watch is tracking](${ctx.pagesUrl}watch.html#${item.id})`,
    '',
    `@${ctx.owner} Deals can sell out fast. Close this issue whenever you like; you'll get a new one if the price comes back under your target later.`
  ].join('\n');
}

function downBody(source, st, ctx) {
  return [
    `Gear Watch hasn't been able to read **${source.name}** for ${st.failStreak} checks in a row (since ${new Date(st.failingSince).toLocaleString('en-US', { timeZone: 'America/New_York' })} Eastern).`,
    '',
    `Last error: \`${st.lastError}\``,
    '',
    `Deals from this ${SOURCE_LABELS[source.type] || 'source'} won't show up until it answers again. The other sources keep working. This issue closes on its own when it recovers.`,
    '',
    `@${ctx.owner}`
  ].join('\n');
}

// Runs the planned actions. gh is a client from github.mjs, or null to only print them.
export async function sendAlerts(actions, history, ctx, gh, log = console.log) {
  for (const act of actions) {
    try {
      if (act.kind === 'price-clear') {
        history.alerts[act.key] = { ...history.alerts[act.key], active: false };
        continue;
      }
      if (!gh) {
        log(`[alert, not sent: no GitHub token] ${act.kind} ${act.key}`);
        continue;
      }
      if (act.kind === 'price') {
        const prev = history.alerts[act.key];
        let issue = prev?.issue;
        const open = issue ? await gh.isOpen(issue) : false;
        if (open) {
          await gh.comment(issue, priceBody(act.item, act.best, ctx, act.mode === 'lower' ? 'lower' : 'back'));
        } else {
          issue = await gh.createIssue(priceTitle(act.item, act.best), priceBody(act.item, act.best, ctx, 'first'), ['price-alert']);
        }
        history.alerts[act.key] = { issue, price: act.best.price, active: true };
        log(`Alert sent: ${act.item.name} at ${money(act.best.price)} (issue #${issue})`);
      } else if (act.kind === 'source-down') {
        const issue = await gh.createIssue(`Gear Watch can't read ${act.source.name}`, downBody(act.source, act.state, ctx), ['source-down']);
        history.alerts[act.key] = { issue, open: true };
        log(`Source alert sent: ${act.source.name} (issue #${issue})`);
      } else if (act.kind === 'source-up') {
        const { issue } = history.alerts[act.key];
        await gh.comment(issue, `${act.source.name} is answering again. Closing this.`);
        await gh.close(issue);
        history.alerts[act.key] = { issue, open: false };
        log(`Source recovered: ${act.source.name}`);
      }
    } catch (err) {
      // Leave history unchanged so the same alert is tried again next run.
      log(`Could not send ${act.kind} for ${act.key}: ${err.message}`);
    }
  }
}
