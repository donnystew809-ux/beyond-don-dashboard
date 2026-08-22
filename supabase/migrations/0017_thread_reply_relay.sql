-- Persist the Airbnb reply-relay address per conversation.
--
-- Airbnb mints a unique r+<token>@reply.airbnb.com address for each guest
-- thread and puts it in the notification email it sends the host. Mail sent to
-- that address lands in the guest's Airbnb inbox — it is the ONLY way to reach
-- a guest without driving the Airbnb UI, which their ToS forbids.
--
-- The intake route already parses this address and uses it to auto-send a
-- reply in the same request, then throws it away. That made every outbound
-- message strictly reactive: nothing could be sent unless a guest had just
-- written. Storing it lets the dashboard message a guest at any point in the
-- stay — a mid-stay check-in, a heads-up about maintenance — using the same
-- relay Airbnb already gave us for that conversation.
--
-- Relays can rotate, so the timestamp records when we last saw one; a stale
-- address bounces rather than misdelivering.

alter table message_threads
  add column if not exists reply_relay text,
  add column if not exists reply_relay_seen_at timestamptz;

create index if not exists message_threads_reply_relay_idx
  on message_threads (reply_relay)
  where reply_relay is not null;
