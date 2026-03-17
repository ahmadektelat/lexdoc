# RBAC Permission Model

## Built-in Roles

| Role | Code | Level | Description |
|------|------|-------|-------------|
| Super Admin | `superAdmin` | 4 | Full system access across all firms |
| Manager | `manager` | 3 | Firm-wide access, staff management |
| Staff | `staff` | 2 | Access to assigned clients only |
| External | `external` | 1 | Read-only, limited sections |

## Permission Matrix

| Permission | superAdmin | manager | staff | external |
|-----------|-----------|---------|-------|----------|
| `clients.view` | ✅ | ✅ | ✅ (assigned) | ✅ (assigned) |
| `clients.create` | ✅ | ✅ | ❌ | ❌ |
| `clients.edit` | ✅ | ✅ | ✅ (assigned) | ❌ |
| `clients.delete` | ✅ | ✅ | ❌ | ❌ |
| `filings.view` | ✅ | ✅ | ✅ (assigned) | ✅ (assigned) |
| `filings.manage` | ✅ | ✅ | ✅ (assigned) | ❌ |
| `billing.view` | ✅ | ✅ | ❌ | ❌ |
| `billing.manage` | ✅ | ✅ | ❌ | ❌ |
| `invoices.create` | ✅ | ✅ | ❌ | ❌ |
| `staff.view` | ✅ | ✅ | ❌ | ❌ |
| `staff.manage` | ✅ | ✅ | ❌ | ❌ |
| `roles.manage` | ✅ | ❌ | ❌ | ❌ |
| `audit.view` | ✅ | ✅ | ❌ | ❌ |
| `reports.view` | ✅ | ✅ | ❌ | ❌ |
| `reports.export` | ✅ | ✅ | ❌ | ❌ |
| `messaging.send` | ✅ | ✅ | ✅ (assigned) | ❌ |
| `documents.view` | ✅ | ✅ | ✅ (assigned) | ✅ (assigned) |
| `documents.manage` | ✅ | ✅ | ✅ (assigned) | ❌ |
| `backup.manage` | ✅ | ❌ | ❌ | ❌ |
| `settings.manage` | ✅ | ✅ | ❌ | ❌ |

## UI-Level Permission Check

```typescript
// In the auth store
function can(permission: string): boolean {
  const { role, permissions } = useAuthStore.getState();
  if (role === 'superAdmin') return true;
  return permissions[permission] === true;
}

// Usage in components
const { can } = useAuthStore();

{can('clients.create') && (
  <Button onClick={handleCreate}>{t('clients.addNew')}</Button>
)}

{can('billing.view') && <BillingTab />}
```

## DB-Level Enforcement (RLS)

Permissions MUST be enforced at the database level, not just UI:

```sql
-- Staff can only see assigned clients
CREATE POLICY "clients_staff_select"
  ON public.clients FOR SELECT
  TO authenticated
  USING (
    firm_id IN (SELECT user_firm_ids())
    AND (
      -- Managers see all clients in their firm
      has_firm_role(firm_id, 'manager')
      OR has_firm_role(firm_id, 'superAdmin')
      -- Staff see only assigned clients
      OR assigned_staff_id = (
        SELECT id FROM public.staff
        WHERE user_id = auth.uid() AND firm_id = clients.firm_id
        LIMIT 1
      )
    )
  );
```

## Role Hierarchy

Roles follow a strict hierarchy: `external < staff < manager < superAdmin`

```typescript
const ROLE_HIERARCHY: Record<string, number> = {
  external: 1,
  staff: 2,
  manager: 3,
  superAdmin: 4,
};

function hasMinimumRole(userRole: string, requiredRole: string): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}
```

## Custom Roles

Firms can create custom roles with granular permissions:

```typescript
interface CustomRole {
  id: string;
  firm_id: string;
  name: string;
  permissions: Record<string, boolean>;
  is_system: boolean; // true for the 4 built-in roles
}
```

Custom roles cannot exceed the `manager` level. Only `superAdmin` can create/edit roles.

## Audit Requirements

These operations MUST be logged to the audit trail:
- Client creation/deletion
- Financial edits (billing, invoices)
- Role changes
- Staff permission changes
- Document access (confidential/restricted)
- Filing status changes
- Login events
