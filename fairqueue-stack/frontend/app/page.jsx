"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { API_BASE, WS_BASE, api, loadAuth, saveAuth, clearAuth } from './lib/api';
import { Button, Spinner } from './components/auth/ui';
import { AuthPanel } from './components/auth/AuthPanel';

function TrainCard({ train, onJoin }) {
  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h3>{train.name}</h3>
          <div className="muted">#{train.number}</div>
        </div>
        <strong>{train.date}</strong>
      </div>
      <div className="route">
        <div>
          <strong>{train.departure}</strong>
          <div className="muted">{train.source}</div>
        </div>
        <div>
          <div className="route-line" />
          <div className="muted">{train.duration}</div>
        </div>
        <div className="right">
          <strong>{train.arrival}</strong>
          <div className="muted">{train.dest}</div>
        </div>
      </div>
      <p>{train.coaches * train.seats_per_coach} demo seats across {train.coaches} coaches.</p>
      <Button className="full" onClick={() => onJoin(train)}>
        Join Queue
      </Button>
    </article>
  );
}

function Metrics({ status }) {
  return (
    <div className="metric-grid">
      <div className="metric">
        <span>Status</span>
        <strong>{status.status}</strong>
      </div>
      <div className="metric">
        <span>Position</span>
        <strong>{status.position || 0}</strong>
      </div>
      <div className="metric">
        <span>Waiting</span>
        <strong>{status.queue_depth || 0}</strong>
      </div>
      <div className="metric">
        <span>ETA</span>
        <strong>{status.eta_seconds || 0}s</strong>
      </div>
    </div>
  );
}

function SeatPicker({ session, token, onLocked }) {
  const [seats, setSeats] = useState([]);
  const [error, setError] = useState("");
  const [busySeat, setBusySeat] = useState("");

  async function loadSeats() {
    try {
      const data = await api(`/trains/${session.trainId}/seats`);
      setSeats(data.seats);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadSeats();
    const timer = setInterval(loadSeats, 2500);
    return () => clearInterval(timer);
  }, [session.trainId]);

  const coaches = useMemo(() => {
    const grouped = new Map();
    for (const seat of seats) {
      if (!grouped.has(seat.coach)) grouped.set(seat.coach, []);
      grouped.get(seat.coach).push(seat);
    }
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [seats]);

  async function lock(seat) {
    setBusySeat(seat.id);
    setError("");
    try {
      const result = await api("/seats/lock", {
        token,
        method: "POST",
        body: JSON.stringify({
          train_id: session.trainId,
          seat_id: seat.id,
        }),
      });
      onLocked({ seat, lock: result });
    } catch (err) {
      setError(err.message);
      await loadSeats();
    } finally {
      setBusySeat("");
    }
  }

  return (
    <section className="panel">
      <h2>Pick a Seat</h2>
      <p>Available seats can be locked once you are admitted. Locks use Redis `SET NX EX` and expire automatically.</p>
      {error && <div className="notice">{error}</div>}
      {coaches.map(([coach, list]) => (
        <div className="seat-section" key={coach}>
          <h3>{coach}</h3>
          <div className="seat-grid">
            {list
              .sort((a, b) => a.seat_number - b.seat_number)
              .map((seat) => {
                const booked = seat.status === "booked";
                const locked = seat.locked && !booked;
                return (
                  <button
                    key={seat.id}
                    className={`seat ${locked ? "locked" : ""} ${booked ? "booked" : ""}`}
                    disabled={booked || locked || busySeat === seat.id}
                    onClick={() => lock(seat)}
                    title={booked ? "Booked" : locked ? `Locked by ${seat.locked_by}` : "Lock seat"}
                  >
                    {seat.seat_number}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </section>
  );
}

function Payment({ session, token, locked, onDone, onRelease }) {
  const [name, setName] = useState("Demo Passenger");
  const [age, setAge] = useState(30);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ttl, setTtl] = useState(locked.lock.ttl || 0);

  useEffect(() => {
    const timer = setInterval(() => setTtl((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);

  async function pay() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/payment/process", {
        token,
        method: "POST",
        body: JSON.stringify({
          train_id: session.trainId,
          seat_id: locked.seat.id,
          passenger_name: name,
          passenger_age: Number(age),
        }),
      });
      onDone(result.booking);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Confirm Booking</h2>
      <p>Seat {locked.seat.label} is locked for this session. Mock payment finalizes the database booking atomically.</p>
      <div className="metric-grid">
        <div className="metric">
          <span>Seat</span>
          <strong>{locked.seat.label}</strong>
        </div>
        <div className="metric">
          <span>Lock TTL</span>
          <strong>{ttl}s</strong>
        </div>
        <div className="metric">
          <span>Fare</span>
          <strong>1499</strong>
        </div>
        <div className="metric">
          <span>Flow</span>
          <strong>Mock</strong>
        </div>
      </div>
      {error && <div className="notice">{error}</div>}
      <div className="form">
        <div className="field">
          <label>Passenger name</label>
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="field">
          <label>Passenger age</label>
          <input type="number" value={age} onChange={(event) => setAge(event.target.value)} />
        </div>
        <div className="row">
          <Button className="secondary" disabled={busy} onClick={onRelease}>
            Release
          </Button>
          <Button disabled={busy || ttl <= 0} onClick={pay}>
            Pay and Book
          </Button>
        </div>
      </div>
    </section>
  );
}

function BookingFlow({ auth }) {
  const [trains, setTrains] = useState([]);
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(null);
  const [locked, setLocked] = useState(null);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const wsRef = useRef(null);

  useEffect(() => {
    api("/trains").then((data) => setTrains(data.trains)).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!session || status?.status !== "waiting") return;
    const ws = new WebSocket(`${WS_BASE}/ws/queue?train_id=${session.trainId}&token=${encodeURIComponent(auth.token)}`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      const next = JSON.parse(event.data);
      setStatus(next);
      if (next.status === "admitted") ws.close();
    };
    ws.onerror = () => setError("WebSocket disconnected; use Refresh Status if needed.");
    return () => ws.close();
  }, [session, status?.status]);

  async function join(train) {
    setError("");
    setLocked(null);
    setBooking(null);
    try {
      const result = await api("/queue/join", {
        token: auth.token,
        method: "POST",
        body: JSON.stringify({ train_id: train.id }),
      });
      setSession({ userId: result.user_id, trainId: train.id, trainName: train.name });
      setStatus(result);
    } catch (err) {
      setError(err.message);
    }
  }

  async function refreshStatus() {
    if (!session) return;
    const result = await api(`/queue/status?train_id=${session.trainId}`, { token: auth.token });
    setStatus(result);
  }

  async function release() {
    await api("/seats/release", {
      token: auth.token,
      method: "POST",
      body: JSON.stringify({ seat_id: locked.seat.id }),
    }).catch(() => null);
    setLocked(null);
  }

  function reset() {
    wsRef.current?.close();
    setSession(null);
    setStatus(null);
    setLocked(null);
    setBooking(null);
    setError("");
  }

  if (booking) {
    return (
      <section className="panel">
        <h2>Booking Confirmed</h2>
        <p>Payment {booking.payment_id} confirmed seat {booking.seat_label} for {booking.passenger.name}.</p>
        <Button onClick={reset}>Book Another</Button>
      </section>
    );
  }

  if (locked) {
    return <Payment session={session} token={auth.token} locked={locked} onDone={setBooking} onRelease={release} />;
  }

  if (session && status?.status === "admitted") {
    return <SeatPicker session={session} token={auth.token} onLocked={setLocked} />;
  }

  if (session) {
    return (
      <section className="panel">
        <h2>Waiting Room</h2>
        <p>Session {session.userId.slice(0, 8)} is queued for {session.trainName}. WebSocket updates arrive every 1.5 seconds.</p>
        {status && <Metrics status={status} />}
        {error && <div className="notice">{error}</div>}
        <div className="row">
          <Button className="secondary" onClick={refreshStatus}>
            Refresh Status
          </Button>
          <Button className="secondary" onClick={reset}>
            Start Over
          </Button>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>FairQueue</h1>
            <p>
            A fairness-first ticket booking simulator inspired by high-concurrency systems like IRCTC Tatkal. Built to explore scalable queueing, concurrent booking control, and real-time traffic handling under heavy demand.
            </p>
          </div>
          <div className="panel">
            <h2>Distributed Systems Demo</h2>
            <p>Simulates virtual queueing, controlled batch admission, temporary seat locking, rate limiting, and live booking workflows using Redis, FastAPI, PostgreSQL, and Next.js.</p>
          </div>
        </div>
      </section>
      {error && <div className="notice">{error}</div>}
      <section className="grid trains">
        {trains.map((train) => (
          <TrainCard key={train.id} train={train} onJoin={join} />
        ))}
      </section>
    </>
  );
}

function Admin({ auth }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  async function load() {
    if (auth.user.role !== "admin") return;
    try {
      const nextStats = await api("/admin/stats", { token: auth.token });
      setStats(nextStats);
      const userData = await api("/admin/users", { token: auth.token });
      setUsers(userData.users);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, []);

  async function reset() {
    await api("/admin/reset", { token: auth.token, method: "POST", body: JSON.stringify({}) });
    await load();
  }

  async function deleteUser(userId) {
    await api(`/admin/users/${userId}`, { token: auth.token, method: "DELETE" });
    await load();
  }

  if (auth.user.role !== "admin") {
    return (
      <section className="panel">
        <h2>Admin Only</h2>
        <p>Your account can book tickets, but admin stats and user deletion require an admin role.</p>
      </section>
    );
  }

  if (!stats) return <section className="panel">Loading admin stats...</section>;

  return (
    <section className="panel">
      <div className="row">
        <div>
          <h2>Admin Stats</h2>
          <p>Redis counters, queue depth, active locks, and Postgres totals.</p>
        </div>
        <Button className="danger" onClick={reset}>
          Reset Demo
        </Button>
      </div>
      {error && <div className="notice">{error}</div>}
      <div className="metric-grid">
        <div className="metric">
          <span>Joined</span>
          <strong>{stats.stats.total_joined}</strong>
        </div>
        <div className="metric">
          <span>Admitted</span>
          <strong>{stats.stats.total_admitted}</strong>
        </div>
        <div className="metric">
          <span>Booked</span>
          <strong>{stats.stats.total_booked}</strong>
        </div>
        <div className="metric">
          <span>Rate Limited</span>
          <strong>{stats.stats.total_rate_limited}</strong>
        </div>
      </div>
      <div className="list">
        {Object.entries(stats.queues).map(([trainId, queue]) => (
          <div className="row" key={trainId}>
            <span>{trainId}</span>
            <span>waiting {queue.waiting || 0} / admitted {queue.admitted || 0}</span>
          </div>
        ))}
        <div className="row">
          <span>Database</span>
          <span>
            {stats.db.trains} trains, {stats.db.seats_booked}/{stats.db.seats_total} seats booked, {stats.db.bookings} bookings
          </span>
        </div>
        <div className="row">
          <span>Active locks</span>
          <span>{stats.active_lock_count}</span>
        </div>
      </div>
      <h3>User Management</h3>
      <div className="list">
        {users.map((user) => (
          <div className="row" key={user.id}>
            <span>{user.email} ({user.role})</span>
            <Button className="danger" disabled={user.id === auth.user.id} onClick={() => deleteUser(user.id)}>
              Delete
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Home() {
  const [tab, setTab] = useState("book");
  const [auth, setAuth] = useState(null);

  useEffect(() => {
    setAuth(loadAuth());
  }, []);

  function logout() {
    clearAuth();
    setAuth(null);
    setTab("book");
  }

  if (!auth) return <AuthPanel onAuth={setAuth} />;

  return (
    <>
      <header className="topbar">
        <div className="shell topbar-inner">
          <div className="brand">
            <div className="brand-mark">FQ</div>
            <span>FairQueue</span>
          </div>
          <div className="muted hide-sm">{auth.user.email}</div>
          <nav className="tabs">
            <button className={`tab ${tab === "book" ? "active" : ""}`} onClick={() => setTab("book")}>
              Book
            </button>
            <button className={`tab ${tab === "admin" ? "active" : ""}`} onClick={() => setTab("admin")}>
              Admin
            </button>
            <button className="tab" onClick={logout}>
              Logout
            </button>
          </nav>
        </div>
      </header>
      <main className="shell">{tab === "book" ? <BookingFlow auth={auth} /> : <Admin auth={auth} />}</main>
    </>
  );
}
