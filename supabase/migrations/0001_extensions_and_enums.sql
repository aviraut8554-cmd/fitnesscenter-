-- 0001_extensions_and_enums.sql
-- Fitness Creator OS — extensions, dedicated schema, and enum types.
-- All enum types live in the default `public` schema; a private `app` schema
-- holds SECURITY DEFINER helper functions used by RLS (added in a later migration).

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";        -- case-insensitive text (emails, subdomains)
create extension if not exists "btree_gist";    -- exclusion constraints for booking overlap

-- Private schema for helper functions. Not exposed via PostgREST.
create schema if not exists app;
revoke all on schema app from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

-- Team member roles within a tenant.
create type team_role as enum ('owner', 'manager', 'support');

-- Lifecycle status of a client. Stored explicitly; `renewal_due`/`expired`
-- transitions are driven by background jobs on subscription period ends.
create type client_status as enum ('trial', 'active', 'renewal_due', 'expired', 'churned');

-- Sellable product/service categories.
create type product_type as enum ('course', 'live_class', 'consultation', 'merch');

-- Billing cadence for a product/service.
create type billing_cycle as enum ('one_time', 'weekly', 'monthly', 'quarterly', 'yearly');

-- Order lifecycle. Transitions to paid/failed/refunded are webhook-driven only.
create type order_status as enum ('created', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled');

-- Razorpay payment lifecycle mirrored locally.
create type payment_status as enum ('created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded');

-- Subscription lifecycle mirrored from Razorpay subscriptions.
create type subscription_status as enum ('created', 'authenticated', 'active', 'pending', 'halted', 'paused', 'cancelled', 'completed', 'expired');

-- Consultation booking lifecycle.
create type booking_status as enum ('scheduled', 'completed', 'cancelled', 'no_show', 'rescheduled');

-- Attendance marking for a class session.
create type attendance_status as enum ('registered', 'present', 'absent', 'late', 'excused');

-- Who authored a chat message.
create type sender_type as enum ('client', 'team');

-- Channels an automation rule can fire on.
create type automation_channel as enum ('whatsapp', 'email');

-- Trigger events an automation rule can subscribe to.
create type automation_trigger as enum (
  'client_signup',
  'health_form_submitted',
  'payment_success',
  'payment_failed',
  'subscription_renewal_due',
  'subscription_expired',
  'booking_created',
  'booking_reminder',
  'class_reminder',
  'client_churned'
);

-- Invoice lifecycle.
create type invoice_status as enum ('draft', 'issued', 'paid', 'void', 'refunded');
