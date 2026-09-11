"use client";
import { SaveStatus } from "./ui/save-status";
import { EntryMenu, MemberCard, NoteComposer } from "./ui/house-controls";
import { DraggableRow } from "./ui/list-order";
import { PresenceRow, memberPaper } from "./ui/presence";

import { activityWhen } from "@/lib/activity";
import { HouseCompanion } from "@/components/ui/house-companion";
import { expenseBalances } from "@/lib/expenses";
import ExpensesTab from "./expenses-tab";
import styles from "./hub.module.css";

import { shoppingListText } from "@/lib/household-actions";
import { AnimatedCheck } from "@/components/ui/animated-check";
import { Button } from "@/components/ui/button";
import { AnimatePresence, m } from "motion/react";

import HomeBoard from "@/components/home-board";
import HubSkeleton from "@/components/hub-skeleton";
import { DisplayButton } from "@/components/ui/display-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { collapseSeries, dayOrder, titleGroup } from "@/lib/household-actions";
import { safeUrl, type Entry, type Kind, type Member } from "@/lib/model";
import {
  ArrowRight,
  ExternalLink,
  Hand,
  Home,
  Leaf,
  LogOut,
  Plus,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import {
  asPhrase,
  categories,
  labels,
  money,
  tabs,
} from "@/lib/household-config";
import { useHousehold } from "@/lib/use-household";
import ActivityFeed from "./activity-feed";
import CalendarTab from "./calendar-tab";
import EntryDialog from "./entry-dialog";
import Auth from "./house-auth";
import { DayDialog, Empty, ShortcutsDialog } from "./house-dialogs";
import HouseholdSettings from "./household-settings";
export default function Hub() {
  const house = useHousehold();
  const {
    reduced,
    ready,
    loaded,
    session,
    signingIn,
    signIn,
    demo,
    household,
    members,
    entries,
    tab,
    setTab,
    editing,
    setEditing,
    showShortcuts,
    setShowShortcuts,
    busy,
    error,
    setError,
    notice,
    setNotice,
    noticeAction,
    setNoticeAction,
    undoDeletes,
    selectedDay,
    setSelectedDay,
    filter,
    setFilter,
    display,
    identity,
    choosingPerson,
    setChoosingPerson,
    uid,
    sharedScreen,
    houseIdentity,
    pending,
    savedIds,
    expenseController,
    taskOrder,
    shoppingOrder,
    today,
    changeDisplay,
    refresh,
    live,
    signOut,
    save,
    toggle,
    pushToTomorrow,
    handOff,
    nudge,
    claim,
    toggleBought,
    needAgain,
    addItems,
    togglePayment,
    coverBill,
    remove,
    undoDelete,
    choosePerson,
    tasks,
    shopping,
    filteredTasks,
    filteredShopping,
    notes,
    takenDown,
    takeDown,
    person,
    friendlyDate,
  } = house;
  // The shared screen reads the house but is nobody in particular, so nothing
  // that needs an author is offered. The gateway refuses that identity anyway.
  const readOnly = sharedScreen;
  const whoAmI = readOnly ? "Household" : person(uid || null);
  // A housemate's load counts a repeating chore once, the way the overview
  // does. Every future occurrence is open too, and "52 open to-dos" is
  // nobody's week. Collapsing wants date order.
  const openChores = collapseSeries(
    tasks
      .filter((entry) => !entry.done)
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")),
    today,
  );
  const avatar = (member: Member, i: number) => (
    <MemberCard
      key={member.user_id}
      name={member.name}
      balance={
        expenseController.loaded && !expenseController.error
          ? expenseBalances(expenseController.expenses)[member.user_id] || 0
          : null
      }
      chores={
        openChores.filter((entry) => entry.assignee === member.user_id).length
      }
    >
      <span title={member.name} className={`avatar tone-${i % 3}`}>
        {member.name.slice(0, 1).toUpperCase()}
      </span>
    </MemberCard>
  );
  // The legacy shared identity is nobody in particular, so it can't be on it.
  const claimedBy = (entry: Entry) =>
    members.some((m) => m.user_id === entry.assignee && m.name !== "Housemates")
      ? entry.assignee
      : null;
  // The shopping box is a notepad: one thing per line, Enter adds what's
  // there and leaves the cursor in place, so a list goes in the way it
  // would on paper. A to-do is still one line.
  const quickAdd = (kind: "task" | "request") =>
    readOnly ? null : (
      <form
        className="quick-add"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const raw = String(new FormData(form).get("title") || "");
          const lines =
            kind === "request"
              ? raw
                  .split(/\n/)
                  // A title is at most 160 characters; a longer line keeps
                  // its start rather than being lost from the middle of a paste.
                  .map((line) => line.trim().slice(0, 160))
                  .filter(Boolean)
              : [raw.trim()].filter(Boolean);
          if (!lines.length) return;
          if (kind === "request" && lines.length > 1) addItems(lines);
          else
            void save({
              kind,
              title: lines[0],
              category: categories[kind][0],
              description: "",
              date: null,
              assignee: kind === "task" && filter === "Mine" ? uid : null,
              amount: null,
              url: "",
            });
          form.reset();
          const box = form.elements.namedItem("title") as HTMLElement | null;
          if (box) box.style.height = "";
        }}
      >
        {kind === "request" ? (
          <textarea
            name="title"
            aria-label="Add items, one per line"
            placeholder="Add items, one per line…"
            rows={1}
            required
            maxLength={2000}
            onKeyDown={(event) => {
              // Enter while an IME is composing confirms the candidate; only a
              // plain Enter adds the lines.
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            onInput={(event) => {
              const box = event.currentTarget;
              box.style.height = "";
              // scrollHeight excludes the borders; without them the box sits
              // two pixels short and grows a scrollbar it never needs.
              box.style.height = `${box.scrollHeight + box.offsetHeight - box.clientHeight}px`;
            }}
          />
        ) : (
          <input
            name="title"
            aria-label={`Quick add ${labels[kind]}`}
            placeholder="Add a to-do and press Enter…"
            required
            maxLength={160}
          />
        )}
        <Button
          className="button small"
          aria-label={`Quick add ${labels[kind]}`}
        >
          <Plus size={16} />
          Add
        </Button>
      </form>
    );
  const addButton = (kind: Kind, text = `Add ${labels[kind]}`) =>
    readOnly ? null : (
      <Button className="button small" onClick={() => setEditing({ kind })}>
        <Plus size={16} />
        {text}
      </Button>
    );
  // Only another housemate's to-do, and only where a push can actually land.
  const canNudge = (entry: Entry) =>
    !demo &&
    Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) &&
    !!entry.assignee &&
    entry.assignee !== uid &&
    members.some(
      (m) => m.user_id === entry.assignee && m.name !== "Housemates",
    );
  // Phones hand the list to Messages; a laptop just copies it.
  const shareList = async () => {
    const text = shoppingListText(shopping, members, household!.name);
    if (!text) return;
    try {
      if (navigator.share && navigator.canShare?.({ text })) {
        await navigator.share({
          title: `Shopping for ${household!.name}`,
          text,
        });
      } else {
        await navigator.clipboard.writeText(text);
        setNotice("List copied");
      }
    } catch (err) {
      // Closing the share sheet is not a failure. The error banner is for
      // the household failing to load, so this stays a passing notice.
      if ((err as Error).name !== "AbortError")
        setNotice("Couldn’t share the list");
    }
  };
  const taskRow = (entry: Entry, index: number) => (
    <DraggableRow
      title={entry.title}
      index={index}
      count={filteredTasks.length}
      onMove={(to) => taskOrder.move(filteredTasks, index, to)}
      className={`task-row ${entry.done ? "completed" : ""}`}
      key={entry.id}
    >
      <Button
        className="checkbox"
        disabled={readOnly}
        aria-label={`${entry.done ? "Reopen" : "Complete"} ${entry.title}`}
        aria-pressed={entry.done}
        onClick={() => void toggle(entry)}
      >
        {entry.done && <AnimatedCheck size={14} />}
      </Button>
      <Button
        className="entry-label"
        disabled={readOnly}
        onClick={() => setEditing({ kind: entry.kind, entry })}
      >
        <span>
          {entry.title}
          {entry.series_id ? " ↻" : ""}
          {entry.rotation_members?.length ? ", taking turns" : ""}
        </span>
        <small
          className={
            entry.date && entry.date < today && !entry.done ? "overdue" : ""
          }
        >
          {entry.date && entry.date < today && !entry.done
            ? `Overdue ${entry.category.toLowerCase()}, was due ${asPhrase(friendlyDate(entry.date))}`
            : entry.date
              ? `${entry.category} for ${asPhrase(friendlyDate(entry.date))}`
              : `${entry.category}, anytime`}
          {members.some(
            (m) => m.user_id === entry.created_by && m.name !== "Housemates",
          )
            ? `. Added by ${person(entry.created_by)}`
            : ""}
        </small>
      </Button>
      {members.some(
        (m) => m.user_id === entry.assignee && m.name !== "Housemates",
      ) && (
        <span className="person-tag">
          <span
            className={`person-dot tone-${
              Math.max(
                0,
                members.findIndex((m) => m.user_id === entry.assignee),
              ) % 3
            }`}
          />
          {person(entry.assignee)}
        </span>
      )}
      {!readOnly && (
        <EntryMenu
          title={entry.title}
          onEdit={() => setEditing({ kind: entry.kind, entry })}
          onDelete={() => void remove(entry)}
          actions={
            entry.done
              ? []
              : [
                  {
                    label:
                      entry.date && entry.date > today
                        ? "Push back a day"
                        : "Push to tomorrow",
                    onSelect: () => pushToTomorrow(entry),
                  },
                  ...(canNudge(entry)
                    ? [
                        {
                          label: `Nudge ${person(entry.assignee)}`,
                          onSelect: () => void nudge(entry),
                        },
                      ]
                    : []),
                  ...members
                    .filter(
                      (m) =>
                        m.name !== "Housemates" && m.user_id !== entry.assignee,
                    )
                    .map((m) => ({
                      label: `Hand to ${m.name}`,
                      onSelect: () => handOff(entry, m),
                    })),
                ]
          }
        />
      )}
    </DraggableRow>
  );

  if (!ready)
    return display ? (
      <main className="auth-wrap">
        <Leaf size={36} />
        <p>Making room for you…</p>
      </main>
    ) : (
      <HubSkeleton />
    );
  if (!demo && !session) return <Auth onSuccess={signIn} />;
  if (!demo && !loaded)
    return display || signingIn ? (
      <main className="auth-wrap">
        <Leaf size={36} />
        <p>Opening your home…</p>
      </main>
    ) : (
      <HubSkeleton />
    );
  if (!household)
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <h1>Your home is taking a moment.</h1>
          <p role="alert">{error || "Could not load your household."}</p>
          <Button className="button" onClick={() => void refresh()}>
            Try again
          </Button>
          <Button className="text-button" onClick={() => void signOut()}>
            Sign out
          </Button>
        </section>
      </main>
    );

  if ((!demo && !identity) || choosingPerson)
    return (
      <main className="auth-wrap">
        <section className="auth-card">
          <p className="eyebrow">MAKE YOURSELF AT HOME</p>
          <h1>Who’s this?</h1>
          <p className="subtitle">Pick who’s using this device.</p>
          <div className="person-picker">
            {members
              .filter((m) => m.name !== "Housemates")
              .map((member, i) => (
                <Button
                  className="button secondary"
                  key={member.user_id}
                  aria-label={member.name}
                  disabled={busy}
                  onClick={() => void choosePerson(member)}
                >
                  <span className={`avatar tone-${i % 3}`}>
                    {member.name.slice(0, 1).toUpperCase()}
                  </span>
                  {member.name}
                </Button>
              ))}
          </div>
          {!demo && houseIdentity && (
            <Button
              className="button secondary"
              disabled={busy}
              onClick={() => void choosePerson(houseIdentity)}
            >
              <span className="avatar tone-2">
                <Home size={15} />
              </span>
              This is a shared screen
            </Button>
          )}
          {!demo && houseIdentity && (
            <p className="subtle">
              For the kitchen or a wall display. It shows the house by name and
              stays read-only — pick a person to check things off.
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!demo && (
            <Button className="text-button" onClick={() => void signOut()}>
              Sign out
            </Button>
          )}
        </section>
      </main>
    );

  const toasts = display ? null : (
    <div className="toast-stack">
      <AnimatePresence initial={false}>
        {notice && (
          <PresenceRow
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="toast"
            key="notice"
            role="status"
          >
            {notice}
          </PresenceRow>
        )}
        {noticeAction && (
          <PresenceRow
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="toast"
            key="notice-action"
            role="status"
          >
            <span>{noticeAction.text}</span>
            <Button
              className="undo-button"
              onClick={() => {
                noticeAction.run();
                setNoticeAction(null);
              }}
            >
              {noticeAction.label}
            </Button>
          </PresenceRow>
        )}
        {undoDeletes.map((item) => (
          <PresenceRow
            layout={reduced ? false : "position"}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="toast"
            role="status"
            key={item.token}
          >
            <span>
              {item.entries.length > 1
                ? `${item.entries.length} occurrences deleted`
                : `Deleted “${item.entries[0]?.title}”`}
            </span>
            <Button
              className="undo-button"
              onClick={() => undoDelete(item.token)}
            >
              Undo
            </Button>
          </PresenceRow>
        ))}
      </AnimatePresence>
    </div>
  );

  const PageIcon = tabs.find((item) => item.name === tab)?.icon || Settings;
  const now = new Date();
  const openTasks = tasks.filter((entry) => !entry.done);
  const doneCount = tasks.length - openTasks.length;
  const neededItems = shopping.filter((entry) => !entry.done);
  // The legacy shared identity is a row in members, not a person in the house.
  const housemates = members.filter((member) => member.name !== "Housemates");
  // What the nav badge counts: to-dos that have come due, the same set the
  // board's greeting counts. Every future occurrence of a repeating chore is
  // open too, and a badge reading 52 would say nothing about today.
  const dueTasks = openTasks.filter(
    (entry) => entry.date && entry.date <= today,
  );

  const boardProps = {
    activity: house.activity,
    household,
    entries,
    members,
    memberId: uid,
    expenses: expenseController,
    demo,
    live,
    error,
    onExit: () => changeDisplay(false),
    onOpen: (kind: Kind, entry?: Entry) => setEditing({ kind, entry }),
    onNavigate: setTab,
    onToggle: toggleBought,
    onPay: togglePayment,
    readOnly,
  };
  if (display)
    return (
      <main>
        <HomeBoard {...boardProps} display />
        {toasts}
      </main>
    );

  return (
    <div
      className={`${styles.shell} app-shell ${tab === "Overview" || tab === "Calendar" ? "fitted-app" : ""}`}
    >
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Common Ground home">
          <span className="brand-icon">
            <Leaf size={24} />
          </span>
          <span className="brand-text">
            common
            <br />
            ground<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="nav-label">{household.name}</span>
        <nav aria-label="Main navigation">
          {tabs.map(({ name, icon: Icon }) => (
            <Button
              key={name}
              className={tab === name ? "active" : ""}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
            >
              {tab === name && (
                <m.span
                  className="nav-highlight"
                  layoutId={reduced ? undefined : "navigation"}
                  transition={{ type: "spring", stiffness: 360, damping: 32 }}
                  aria-hidden="true"
                />
              )}
              <Icon size={19} />
              <span>{name}</span>
              {name === "Shopping list" && !!neededItems.length && (
                <span
                  className="nav-count"
                  aria-label={`${neededItems.length} to pick up`}
                >
                  {neededItems.length}
                </span>
              )}
              {name === "To-dos" && !!dueTasks.length && (
                <span
                  className="nav-count"
                  aria-label={`${dueTasks.length} due`}
                >
                  {dueTasks.length}
                </span>
              )}
            </Button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="rail-companion">
            <HouseCompanion />
          </div>
          <Button
            className={`settings-link ${tab === "Our household" ? "selected" : ""}`}
            onClick={() => setTab("Our household")}
          >
            <Settings size={18} /> Our household
          </Button>
          <div className="sidebar-profile">
            <Button
              className="text-button profile-switch"
              onClick={() => setChoosingPerson(true)}
              aria-label={`Switch person (now ${whoAmI})`}
            >
              <span
                className={`avatar tone-${
                  Math.max(
                    0,
                    members.findIndex((m) => m.user_id === uid),
                  ) % 3
                }`}
              >
                {readOnly ? <Home size={15} /> : whoAmI.slice(0, 1)}
              </span>
              <span className="profile-copy">
                <strong>{whoAmI}</strong>
                <small>
                  {demo
                    ? "Exploring the demo"
                    : readOnly
                      ? "Shared screen, read-only"
                      : "Right at home"}
                </small>
              </span>
            </Button>
            {!demo && (
              <Button
                aria-label="Sign out"
                className="icon-button"
                onClick={() => void signOut()}
              >
                <LogOut size={17} />
              </Button>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <HouseCompanion variant="compact" />
          <span>
            <Home size={15} /> {household.name} <span className="slash">/</span>{" "}
            <strong>{tab}</strong>
          </span>
          <div>
            <DisplayButton onClick={() => changeDisplay(true)} />
            <span className="private-label">
              <ShieldCheck size={14} />
              {demo ? "Demo home" : "Private household"}
            </span>
            <Button
              className="icon-button avatar-stack"
              aria-label="Open household settings"
              onClick={() => setTab("Our household")}
            >
              {members.map((member, i) =>
                member.name === "Housemates" ? null : (
                  <span
                    key={member.user_id}
                    title={member.name}
                    className={`avatar tone-${i % 3}`}
                  >
                    {member.name.slice(0, 1).toUpperCase()}
                  </span>
                ),
              )}
            </Button>
            {!demo && (
              <Button
                className="icon-button"
                aria-label="Sign out of household"
                onClick={() => void signOut()}
              >
                <LogOut size={16} />
              </Button>
            )}
          </div>
        </header>
        <main
          key={tab}
          className={`content ${tab === "Overview" ? "home-content" : tab === "Calendar" ? "calendar-content" : ""}`}
        >
          <SaveStatus demo={demo} />
          {demo && (
            <div className="demo-banner">
              <span>
                <Sparkles size={15} /> Sample household. Try everything; changes
                last until you reload.
              </span>
              <Button onClick={() => setTab("Our household")}>
                Connect your home <ArrowRight size={14} />
              </Button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <Button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </Button>
            </div>
          )}
          {tab !== "Overview" && tab !== "Expenses" && (
            <m.div
              key={tab}
              initial={reduced ? false : { opacity: 0.5 }}
              animate={{ opacity: 1 }}
              className="page-heading"
            >
              <div className="heading-copy">
                {tab !== "Calendar" && (
                  <span className="page-symbol" aria-hidden="true">
                    <PageIcon size={23} />
                  </span>
                )}
                <div>
                  <h1>{tab}</h1>
                  <p className="subtitle">
                    {
                      {
                        Calendar: "Plans and dated to-dos for your home.",
                        "To-dos": `${openTasks.length} open, ${openTasks.filter((entry) => entry.assignee === uid).length} assigned to you`,
                        "Shopping list": `${neededItems.length} ${neededItems.length === 1 ? "item" : "items"} to pick up`,
                        "House notes": `${notes.length} ${notes.length === 1 ? "note" : "notes"} shared with your home${takenDown.length ? `, ${takenDown.length} taken down` : ""}`,
                        "Our household": `${household.name}, ${housemates.length} ${housemates.length === 1 ? "housemate" : "housemates"}`,
                        Overview: "",
                        Expenses: "",
                      }[tab]
                    }
                  </p>
                </div>
              </div>
              {tab !== "Our household" &&
                addButton(
                  tab === "Calendar"
                    ? "event"
                    : tab === "Shopping list"
                      ? "request"
                      : tab === "House notes"
                        ? "note"
                        : "task",
                )}
            </m.div>
          )}

          {tab === "Overview" && <HomeBoard {...boardProps} />}
          {tab === "Expenses" && (
            <ExpensesTab
              controller={expenseController}
              members={members.filter((member) => member.name !== "Housemates")}
              memberId={uid}
              pending={shopping.filter((e) => !e.done && e.amount != null)}
            />
          )}

          {tab === "Calendar" && <CalendarTab {...house} />}
          {tab === "To-dos" && (
            <section className="panel entry-panel paper-index">
              <div className="panel-heading">
                <SegmentedControl
                  label="To-do filters"
                  values={["All", "Mine", "Open", "Done"]}
                  value={filter}
                  onChange={setFilter}
                />
                <div className="list-progress">
                  <span>
                    {doneCount} of {tasks.length} done
                  </span>
                  <progress
                    aria-label="To-do completion"
                    value={doneCount}
                    max={Math.max(1, tasks.length)}
                  />
                </div>
              </div>
              {quickAdd("task")}
              <AnimatePresence initial={false}>
                {filteredTasks.map(taskRow)}
              </AnimatePresence>
              {!tasks.filter(
                (e) =>
                  filter === "All" ||
                  (filter === "Mine" && e.assignee === uid) ||
                  (filter === "Open" && !e.done) ||
                  (filter === "Done" && e.done),
              ).length && (
                <Empty text="Nothing here. A little breathing room." />
              )}
            </section>
          )}

          {tab === "Shopping list" && (
            <section className="panel entry-panel paper-receipt">
              <div className="panel-heading">
                <SegmentedControl
                  label="Shopping filters"
                  values={["All", "Need", "Want", "Bought"]}
                  value={filter}
                  onChange={setFilter}
                />
                <span className="list-tools">
                  {filter !== "Bought" &&
                    filteredShopping.some((e) => e.amount != null) && (
                      <span className="subtle">
                        Estimated total{" "}
                        <strong>
                          {money(
                            filteredShopping.reduce(
                              (sum, e) => sum + Number(e.amount || 0),
                              0,
                            ),
                          )}
                        </strong>
                      </span>
                    )}
                  {shopping.some((e) => !e.done) && (
                    <Button
                      className="text-button"
                      onClick={() => void shareList()}
                    >
                      <Share2 size={14} />
                      Share list
                    </Button>
                  )}
                </span>
              </div>
              {quickAdd("request")}
              <div className="shopping-list">
                <AnimatePresence initial={false}>
                  {filteredShopping.map((entry, index) => {
                    const group = titleGroup(entry.title);
                    return (
                      <DraggableRow
                        title={entry.title}
                        index={index}
                        count={filteredShopping.length}
                        onMove={(to) =>
                          shoppingOrder.move(filteredShopping, index, to)
                        }
                        className={`task-row shopping-row ${entry.done ? "completed" : ""}`}
                        key={entry.id}
                      >
                        <Button
                          className="checkbox"
                          disabled={readOnly}
                          aria-label={`${entry.done ? "Reopen" : "Mark as bought"}: ${entry.title}`}
                          aria-pressed={entry.done}
                          onClick={() => toggleBought(entry)}
                        >
                          {entry.done && <AnimatedCheck size={14} />}
                        </Button>
                        <Button
                          className="entry-label"
                          disabled={readOnly}
                          onClick={() => setEditing({ kind: "request", entry })}
                        >
                          <h2>{group?.heading ?? entry.title}</h2>
                          {group && (
                            <span className="row-group">
                              {group.items.map((item, i) => (
                                <span key={`${item}-${i}`}>{item}</span>
                              ))}
                            </span>
                          )}
                          <small>
                            {entry.category}
                            {claimedBy(entry)
                              ? `, ${claimedBy(entry) === uid ? "you’re" : `${person(entry.assignee)}’s`} getting it`
                              : ""}
                            {entry.description ? `. ${entry.description}` : ""}
                          </small>
                          {members.some(
                            (m) =>
                              m.user_id === entry.created_by &&
                              m.name !== "Housemates",
                          ) && (
                            <small>Added by {person(entry.created_by)}</small>
                          )}
                        </Button>
                        {entry.amount != null && (
                          <strong className="row-price">
                            {money(entry.amount)}
                          </strong>
                        )}
                        {!entry.done && uid && (
                          <Button
                            className="icon-button claim-button"
                            aria-pressed={claimedBy(entry) === uid}
                            aria-label={`${
                              claimedBy(entry) === uid
                                ? "Never mind, I’m not getting"
                                : claimedBy(entry)
                                  ? "I’ll grab it instead"
                                  : "I’ll grab it"
                            }: ${entry.title}`}
                            onClick={() => claim(entry)}
                          >
                            <Hand size={16} />
                          </Button>
                        )}
                        {safeUrl(entry.url) && (
                          <a
                            className="icon-button"
                            aria-label={`View ${entry.title} in store`}
                            href={safeUrl(entry.url)!}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink size={16} />
                          </a>
                        )}
                        {!readOnly && (
                          <EntryMenu
                            title={entry.title}
                            onEdit={() =>
                              setEditing({ kind: entry.kind, entry })
                            }
                            onDelete={() => void remove(entry)}
                            actions={
                              entry.done
                                ? [
                                    {
                                      label: "Need again",
                                      onSelect: () => needAgain(entry),
                                    },
                                  ]
                                : canNudge(entry)
                                  ? [
                                      {
                                        label: `Nudge ${person(entry.assignee)}`,
                                        onSelect: () => void nudge(entry),
                                      },
                                    ]
                                  : []
                            }
                          />
                        )}
                      </DraggableRow>
                    );
                  })}
                </AnimatePresence>
              </div>
              {!shopping.filter((e) =>
                filter === "Bought"
                  ? e.done
                  : !e.done && (filter === "All" || e.category === filter),
              ).length && (
                <Empty text="Nothing on this list yet. Add something for your home." />
              )}
            </section>
          )}

          {tab === "House notes" && (
            <div className="notes-page">
              {!readOnly && (
                <NoteComposer
                  onSave={(title, description) =>
                    void save({
                      kind: "note",
                      title,
                      description,
                      category: "Note",
                      date: null,
                      assignee: null,
                      amount: null,
                      url: "",
                    })
                  }
                />
              )}
              <div className="notes-grid">
                <AnimatePresence>
                  {notes.map((entry, index) => (
                    <PresenceRow
                      className="notice-board"
                      key={entry.id}
                      paper={entry.id}
                      index={index}
                      style={{
                        backgroundColor: memberPaper(
                          entry.assignee || entry.created_by,
                        ),
                      }}
                      layoutId={reduced ? undefined : `note-${entry.id}`}
                    >
                      <span className="tape" />
                      {!readOnly && (
                        <EntryMenu
                          title={entry.title}
                          onEdit={() => setEditing({ kind: "note", entry })}
                          onConvert={() => setEditing({ kind: "note", entry })}
                          onDelete={() => void remove(entry)}
                          actions={[
                            {
                              label: "Take down",
                              onSelect: () => takeDown(entry, true),
                            },
                          ]}
                        />
                      )}
                      <Button
                        className="note-preview"
                        disabled={readOnly}
                        onClick={() => setEditing({ kind: "note", entry })}
                      >
                        <h3>{entry.title}</h3>
                        <p>{entry.description}</p>
                        <span>
                          {person(entry.assignee || entry.created_by)},{" "}
                          {activityWhen(Date.parse(entry.created_at), now)}
                        </span>
                      </Button>
                    </PresenceRow>
                  ))}
                </AnimatePresence>
                {!notes.length && !takenDown.length && (
                  <Empty text="Your fridge is a blank canvas. Leave a note." />
                )}
              </div>
              {!!takenDown.length && (
                <section className="taken-down">
                  <h2>Taken down</h2>
                  <ul>
                    {takenDown.map((entry) => (
                      <li key={entry.id}>
                        <span>
                          <strong>{entry.title}</strong>
                          <small>
                            {person(entry.assignee || entry.created_by)},{" "}
                            {activityWhen(Date.parse(entry.created_at), now)}
                          </small>
                        </span>
                        {!readOnly && (
                          <>
                            <Button
                              className="text-button"
                              onClick={() => takeDown(entry, false)}
                            >
                              Put back up
                            </Button>
                            <Button
                              className="icon-button"
                              aria-label={`Delete ${entry.title}`}
                              onClick={() => void remove(entry)}
                            >
                              <X size={15} />
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {tab === "Our household" && (
            <>
              <HouseholdSettings {...house} avatar={avatar} />
              <ActivityFeed activity={house.activity} members={members} />
            </>
          )}
        </main>
      </div>
      {toasts}
      <AnimatePresence>
        {selectedDay && (
          <DayDialog
            key="day"
            date={selectedDay}
            entries={dayOrder(
              entries.filter(
                (e) =>
                  e.date === selectedDay && ["task", "event"].includes(e.kind),
              ),
            )}
            person={person}
            onClose={() => setSelectedDay(null)}
            onOpen={
              readOnly
                ? undefined
                : (entry) => {
                    setSelectedDay(null);
                    setEditing({ kind: entry.kind, entry });
                  }
            }
            onAdd={
              readOnly
                ? undefined
                : () => {
                    setEditing({ kind: "event", date: selectedDay });
                    setSelectedDay(null);
                  }
            }
          />
        )}
        {editing && (
          <EntryDialog
            key="entry"
            editing={{
              ...editing,
              entry: editing.entry
                ? entries.find(
                    (e) =>
                      e.id ===
                      (savedIds.current.get(editing.entry!.id) ||
                        editing.entry!.id),
                  ) || editing.entry
                : undefined,
            }}
            uid={uid}
            onPayment={togglePayment}
            onCover={coverBill}
            onNudge={
              !demo && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
                ? (entry, member) => void nudge(entry, member)
                : undefined
            }
            members={members.filter((m) => m.name !== "Housemates")}
            busy={busy}
            error={error}
            onClose={() => {
              if (!busy) {
                setEditing(null);
                setError("");
              }
            }}
            onSave={save}
            onDelete={remove}
          />
        )}
        {showShortcuts && (
          <ShortcutsDialog
            key="shortcuts"
            onClose={() => setShowShortcuts(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
