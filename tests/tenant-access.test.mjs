import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessOffice,
  canManageTeam,
  canManageSettings,
  canMutateDocuments,
  canMutateFinancials,
  canUseMessaging,
  canViewFinancials,
} from "../lib/tenant-access.ts";

const ROLES = ["owner", "admin", "accountant", "employee", "viewer"];

test("canManageTeam/canManageSettings: owner and admin only", () => {
  assert.deepEqual(ROLES.filter((role) => canManageTeam(role)), ["owner", "admin"]);
  assert.deepEqual(ROLES.filter((role) => canManageSettings(role)), ["owner", "admin"]);
});

test("canViewFinancials: owner/admin/accountant/viewer, never employee", () => {
  assert.deepEqual(ROLES.filter((role) => canViewFinancials(role)), ["owner", "admin", "accountant", "viewer"]);
});

test("canMutateFinancials: owner/admin/accountant only — employee and viewer excluded", () => {
  assert.deepEqual(ROLES.filter((role) => canMutateFinancials(role)), ["owner", "admin", "accountant"]);
});

test("canMutateDocuments: owner/admin/accountant/employee, never viewer", () => {
  assert.deepEqual(ROLES.filter((role) => canMutateDocuments(role)), ["owner", "admin", "accountant", "employee"]);
});

test("canUseMessaging: owner/admin/accountant/employee, never viewer", () => {
  assert.deepEqual(ROLES.filter((role) => canUseMessaging(role)), ["owner", "admin", "accountant", "employee"]);
});

test("canAccessOffice: owner/admin/accountant, never employee/viewer", () => {
  assert.deepEqual(ROLES.filter((role) => canAccessOffice(role)), ["owner", "admin", "accountant"]);
});

test("null/undefined role is denied everywhere", () => {
  assert.equal(canManageTeam(null), false);
  assert.equal(canViewFinancials(undefined), false);
  assert.equal(canMutateFinancials(null), false);
  assert.equal(canMutateDocuments(undefined), false);
  assert.equal(canUseMessaging(null), false);
  assert.equal(canAccessOffice(null), false);
});

test("platform staff bypass: supervisor/admin/developer can mutate; helpdesk/moderator/support are read-only", () => {
  for (const platformRole of ["supervisor", "admin", "developer"]) {
    assert.equal(canManageTeam(null, platformRole), true, platformRole);
    assert.equal(canMutateFinancials(null, platformRole), true, platformRole);
    assert.equal(canMutateDocuments(null, platformRole), true, platformRole);
    assert.equal(canUseMessaging(null, platformRole), true, platformRole);
  }
  for (const platformRole of ["helpdesk", "moderator", "support"]) {
    assert.equal(canManageTeam(null, platformRole), false, platformRole);
    assert.equal(canMutateFinancials(null, platformRole), false, platformRole);
    assert.equal(canMutateDocuments(null, platformRole), false, platformRole);
    assert.equal(canUseMessaging(null, platformRole), false, platformRole);
    // but any staff role, including helpdesk/moderator/support, can view and reach /office read-only
    assert.equal(canViewFinancials(null, platformRole), true, platformRole);
    assert.equal(canAccessOffice(null, platformRole), true, platformRole);
  }
});
