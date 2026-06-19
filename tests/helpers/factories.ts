let sequence = 0;

function nextUuid() {
  sequence += 1;
  return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

export function profileFactory(
  overrides: Partial<{ id: string; email: string; name: string }> = {},
) {
  const id = overrides.id ?? nextUuid();

  return {
    id,
    email: overrides.email ?? `user-${sequence}@example.com`,
    name: overrides.name ?? `Test User ${sequence}`,
  };
}

export function organizationFactory(
  overrides: Partial<{ id: string; name: string; slug: string }> = {},
) {
  const id = overrides.id ?? nextUuid();

  return {
    id,
    name: overrides.name ?? `Organization ${sequence}`,
    slug: overrides.slug ?? `organization-${sequence}`,
  };
}

export function locationFactory(
  organizationId: string,
  overrides: Partial<{
    id: string;
    name: string;
    slug: string;
    timezone: string;
    businessDayCutoff: string;
  }> = {},
) {
  const id = overrides.id ?? nextUuid();

  return {
    id,
    organizationId,
    name: overrides.name ?? `Location ${sequence}`,
    slug: overrides.slug ?? `location-${sequence}`,
    timezone: overrides.timezone ?? "America/New_York",
    businessDayCutoff: overrides.businessDayCutoff ?? "04:00",
  };
}

export function membershipFactory(
  organizationId: string,
  profileId: string,
  role: "manager" | "staff",
  overrides: Partial<{ id: string }> = {},
) {
  return {
    id: overrides.id ?? nextUuid(),
    organizationId,
    profileId,
    role,
  };
}
