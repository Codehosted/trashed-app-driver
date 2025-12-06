import {
    pgTable,
    serial,
    varchar,
    text,
    timestamp,
    integer,
    decimal,
    boolean,
    date,
    json,
    pgEnum,
    primaryKey,
    index,
    uniqueIndex,
  } from "drizzle-orm/pg-core";
  import { relations, sql } from "drizzle-orm";
  import type { AdapterAccount } from "next-auth/adapters";
  import { v4 as uuidv4 } from "uuid";
  
  //===========================================================================
  // Enums
  //===========================================================================
  export const rentalStatusEnum = pgEnum("rental_status", [
    "pending",
    "confirmed",
    "denied",
    "in_transit",
    "delivered",
    "pickup_scheduled",
    "completed",
    "cancelled",
  ]);
  
  export const ticketStatusEnum = pgEnum("ticket_status", [
    "open",
    "in_progress",
    "resolved",
    "closed",
  ]);
  export const ticketPriorityEnum = pgEnum("ticket_priority", [
    "low",
    "medium",
    "high",
    "urgent",
  ]);
  export const imageSourceEnum = pgEnum("image_source", [
    "local",
    "remote",
    "unsplash",
    "user_uploaded",
  ]);
  export const paymentStatusEnum = pgEnum("payment_status", [
    "pending",
    "authorized",
    "paid",
    "failed",
    "refunded",
    "partially_refunded",
  ]);
  
  export const paymentTypeEnum = pgEnum("payment_type", [
    "initial",
    "extension",
    "additional_fee",
    "refund",
  ]);
  
  export const paymentMethodTypeEnum = pgEnum("payment_method_type", [
    "stripe_account",
    "stripe_card",
    "stripe_bank_account",
  ]);
  
  export const userRoleEnum = pgEnum("user_role", [
    "customer",
    "vendor",
    "admin",
    "manager",
    "driver",
  ]);
  
  export const vendorTeamRoleEnum = pgEnum("vendor_team_role", [
    "owner",
    "manager",
    "driver",
  ]);
  
  export const vendorUserInvitationStatusEnum = pgEnum(
    "vendor_user_invitation_status",
    ["pending", "accepted", "expired", "revoked"]
  );
  
  export const dumpsterTypeEnum = pgEnum("dumpster_type", [
    "roll_off",
    "rubber_wheel",
    "compactors",
    "front_load",
    "rear_load",
    "side_load",
  ]);
  
  export const customerImportJobStatusEnum = pgEnum("customer_import_job_status", [
    "queued",
    "processing",
    "importing_customers",
    "creating_stripe_accounts",
    "completed",
    "failed",
    "cancelled",
  ]);
  
  export const activeCallStatusEnum = pgEnum("active_call_status", [
    "in-progress",
    "ended",
  ]);
  
  export const interventionTypeEnum = pgEnum("intervention_type", [
    "mute",
    "unmute",
    "join",
    "leave",
  ]);
  
  export const interventionMethodEnum = pgEnum("intervention_method", [
    "web",
    "phone",
  ]);
  
  export const interventionStateEnum = pgEnum("intervention_state", [
    "AI-lead",
    "HumanIntervenor",
    "ReturnToAI",
  ]);
  
  export const callForwardingActionEnum = pgEnum("call_forwarding_action", [
    "enable",
    "disable",
  ]);
  
  export const callForwardingSourceEnum = pgEnum("call_forwarding_source", [
    "primary",
    "secondary",
    "custom",
  ]);
  
  export const routeStatusEnum = pgEnum("route_status", [
    "pending",
    "assigned",
    "in_progress",
    "completed",
    "cancelled",
  ]);
  
  export const stopStatusEnum = pgEnum("stop_status", [
    "pending",
    "en_route",
    "arrived",
    "completed",
    "skipped",
    "failed",
  ]);
  
  export const stopTypeEnum = pgEnum("stop_type", [
    "delivery",
    "pickup",
  ]);
  
  export const optimizationTypeEnum = pgEnum("optimization_type", [
    "time",
    "distance",
    "balanced",
  ]);
  
  //===========================================================================
  // Tables
  //===========================================================================
  
  // Users table (consolidated with vendors)
  export const users = pgTable("users", {
    id: serial("id").primaryKey(),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => uuidv4()),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    image: text("image"),
    password: varchar("password", { length: 255 }),
    emailVerified: timestamp("email_verified", { mode: "date" }),
    phone: varchar("phone", { length: 20 }),
    verificationToken: varchar("verification_token", { length: 255 }),
    resetToken: varchar("reset_token", { length: 255 }),
    resetTokenExpires: timestamp("reset_token_expires", { mode: "date" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  });
  
  export const userRoles = pgTable(
    "user_roles",
    {
      userId: integer("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      role: userRoleEnum("role").notNull(),
    },
    (t) => ({
      pk: primaryKey({ columns: [t.userId, t.role] }),
    })
  );
  
  // Customer table (now a junction table for vendor-customer relationships)
  export const customers = pgTable(
    "customers",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      vendorId: integer("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }), // References the vendor entity
      userId: integer("user_id") // Changed from customerId to userId
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }), // References the user who is a customer
      notes: text("notes"), // Vendor-specific notes about this customer
      stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      vendorIdIdx: index("vendor_id_idx").on(table.vendorId),
      userIdIdx: index("customer_user_id_idx").on(table.userId), // Changed from customerIdIdx and updated name
      vendorCustomerIdx: uniqueIndex("vendor_customer_idx").on(
        table.vendorId,
        table.userId
      ), // Updated to use new userId field
    })
  );
  
  // Dumpsters table
  export const dumpsters = pgTable("dumpsters", {
    id: serial("id").primaryKey(),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => uuidv4()),
    description: text("description").notNull(),
    size: decimal("size", { precision: 3, scale: 1 }).notNull(),
    type: dumpsterTypeEnum("type").notNull(),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    available: boolean("available").notNull().default(true),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendors.id),
    vendorAddressId: integer("vendor_address_id")
      .references(() => vendorAddresses.id, { onDelete: "set null" }),
    weightLimit: integer("weight_limit").notNull(),
    dimensions: json("dimensions").$type<{
      length: number;
      width: number;
      height: number;
    }>(),
    recommendedFor: text("recommended_for").notNull(),
    acceptedMaterials: json("accepted_materials").$type<string[]>(),
    prohibitedMaterials: json("prohibited_materials").$type<string[]>(),
    extraDayPrice: decimal("extra_day_price", {
      precision: 10,
      scale: 2,
    }).notNull(),
    rentalPeriodDays: integer("rental_period_days").notNull().default(7),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  });
  
  export const dumpsterRentalRates = pgTable(
    "dumpster_rental_rates",
    {
      id: serial("id").primaryKey(),
      dumpsterId: integer("dumpster_id")
        .notNull()
        .references(() => dumpsters.id, { onDelete: "cascade" }),
      durationDays: integer("duration_days").notNull(),
      price: decimal("price", { precision: 10, scale: 2 }).notNull(),
      extraDayPrice: decimal("extra_day_price", { precision: 10, scale: 2 }),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      dumpsterDurationIdx: uniqueIndex(
        "dumpster_rental_rates_dumpster_id_duration_days_idx"
      ).on(table.dumpsterId, table.durationDays),
      dumpsterIdIdx: index("dumpster_rental_rates_dumpster_id_idx").on(
        table.dumpsterId
      ),
    })
  );
  
  // Dumpster Images table
  export const dumpsterImages = pgTable("dumpster_images", {
    id: serial("id").primaryKey(),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => uuidv4()),
    dumpsterId: integer("dumpster_id")
      .notNull()
      .references(() => dumpsters.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    source: imageSourceEnum("source").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    dimensions: json("dimensions").$type<{
      width: number;
      height: number;
    }>(),
    attribution: json("attribution").$type<{
      photographer?: string;
      photographerUrl?: string;
      sourceName?: string;
      sourceUrl?: string;
    }>(),
    alt: text("alt"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  });
  
  // Dumpster Search Results table - stores search queries and their results
  export const dumpsterSearchResults = pgTable("dumpster_search_results", {
    id: serial("id").primaryKey(),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => uuidv4()),
    searchParams: json("search_params").$type<{
      location: string;
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      size: number;
      type: string;
      deliveryDate: Date;
      pickupDate?: Date;
      maxDistance?: number;
    }>().notNull(),
    searchCoordinates: json("search_coordinates").$type<{
      lat: number;
      lng: number;
    }>().notNull(),
    results: json("results").$type<Array<{
      dumpsterId: number;
      vendorId: number;
      dumpsterUuid: string;
      price: string;
      distanceMiles: number;
      rank: number;
    }>>().notNull(),
    createdAt: timestamp("created_at", { mode: "date", precision: 3 })
      .notNull()
      .defaultNow(),
  }, (table) => ({
    uuidIdx: index("dumpster_search_results_uuid_idx").on(table.uuid),
    createdAtIdx: index("dumpster_search_results_created_at_idx").on(table.createdAt),
  }));
  
  // Search Result Rankings table - individual dumpster rankings within a search
  export const searchResultRankings = pgTable("search_result_rankings", {
    id: serial("id").primaryKey(),
    searchId: integer("search_id")
      .notNull()
      .references(() => dumpsterSearchResults.id, { onDelete: "cascade" }),
    dumpsterId: integer("dumpster_id")
      .notNull()
      .references(() => dumpsters.id, { onDelete: "cascade" }),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(), // Position in sorted results (1 = cheapest/first)
    priceAtSearch: decimal("price_at_search", { precision: 10, scale: 2 }).notNull(),
    distanceMiles: decimal("distance_miles", { precision: 8, scale: 2 }).notNull(),
    dumpsterUuid: text("dumpster_uuid").notNull(),
    createdAt: timestamp("created_at", { mode: "date", precision: 3 })
      .notNull()
      .defaultNow(),
  }, (table) => ({
    searchIdIdx: index("search_result_rankings_search_id_idx").on(table.searchId),
    dumpsterIdIdx: index("search_result_rankings_dumpster_id_idx").on(table.dumpsterId),
    vendorIdIdx: index("search_result_rankings_vendor_id_idx").on(table.vendorId),
    searchRankIdx: index("search_result_rankings_search_rank_idx").on(table.searchId, table.rank),
  }));
  
  // Rentals table
  export const rentals = pgTable("rentals", {
    id: serial("id").primaryKey(),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => uuidv4()),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    dumpsterId: integer("dumpster_id")
      .notNull()
      .references(() => dumpsters.id),
    status: rentalStatusEnum("status").notNull().default("pending"),
    deliveryDate: date("delivery_date", { mode: "date" }).notNull(),
    pickupDate: date("pickup_date", { mode: "date" }).notNull(),
    totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
    dumpsterRentalRateId: integer("dumpster_rental_rate_id").references(
      () => dumpsterRentalRates.id,
      { onDelete: "set null" }
    ),
    rentalDays: integer("rental_days"),
    paymentIntentId: varchar("payment_intent_id", { length: 255 }),
    searchId: integer("search_id").references(() => dumpsterSearchResults.id, { onDelete: "set null" }),
    confirmed: boolean("confirmed").notNull().default(false),
    confirmedAt: timestamp("confirmed_at", { mode: "date" }),
    vendorConfirmationToken: varchar("vendor_confirmation_token", {
      length: 255,
    }),
    createdAt: timestamp("created_at", { mode: "date", precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", precision: 3 })
      .notNull()
      .defaultNow(),
    notes: text("notes"),
    confirmationCode: varchar("confirmation_code", { length: 255 }),
    messageHistory: json("message_history").$type<
      Array<{
        timestamp: string;
        message: string;
        sentBy: string;
        delivered: boolean;
      }>
    >(),
  }, (table) => ({
    dumpsterRentalRateIdx: index("rentals_dumpster_rental_rate_id_idx").on(
      table.dumpsterRentalRateId
    ),
    searchIdIdx: index("rentals_search_id_idx").on(table.searchId),
  }));
  
  // Rental History table - tracks all status changes and important events
  export const rentalHistory = pgTable("rental_history", {
    id: serial("id").primaryKey(),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => uuidv4()),
    rentalId: integer("rental_id")
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    status: rentalStatusEnum("status").notNull(),
    eventType: varchar("event_type", { length: 50 }).notNull(), // 'status_change', 'created', 'updated', etc.
    previousStatus: rentalStatusEnum("previous_status"), // Only for status changes
    description: text("description").notNull(), // Human-readable description
    metadata: json("metadata").$type<Record<string, any>>(), // Additional context data
    createdAt: timestamp("created_at", { mode: "date", precision: 3 })
      .notNull()
      .defaultNow(),
  });
  
  // Rental Images table
  export const rentalImages = pgTable("rental_images", {
    id: serial("id").primaryKey(),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => uuidv4()),
    rentalId: integer("rental_id")
      .notNull()
      .references(() => rentals.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    source: imageSourceEnum("source").notNull(),
    category: varchar("category", { length: 50 }), // e.g., "delivery_proof", "damage_report", "pickup_confirmation", "general"
    description: text("description"),
    dimensions: json("dimensions").$type<{
      width: number;
      height: number;
    }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }, (table) => ({
    rentalIdIdx: index("rental_images_rental_id_idx").on(table.rentalId),
  }));
  
  // Brokered Rental History table
  export const brokeredRentalHistory = pgTable("brokered_rental_history", {
    id: serial("id").primaryKey(),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => uuidv4()),
    brokeredRentalId: integer("brokered_rental_id")
      .notNull()
      .references(() => brokeredRentals.id, { onDelete: "cascade" }),
    status: rentalStatusEnum("status").notNull(),
    eventType: varchar("event_type", { length: 50 }).notNull(), // 'status_change', 'created', 'updated', etc.
    previousStatus: rentalStatusEnum("previous_status"), // Only for status changes
    description: text("description").notNull(), // Human-readable description
    metadata: json("metadata").$type<Record<string, any>>(), // Additional context data
    createdAt: timestamp("created_at", { mode: "date", precision: 3 })
      .notNull()
      .defaultNow(),
  });
  
  // Support Tickets table
  export const supportTickets = pgTable("support_tickets", {
    id: serial("id").primaryKey(),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => uuidv4()),
    caseNumber: varchar("case_number", { length: 50 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    message: text("message").notNull(),
    status: ticketStatusEnum("status").notNull().default("open"),
    priority: ticketPriorityEnum("priority").notNull().default("medium"),
    userId: integer("user_id")
      .references(() => users.id),
    rentalId: integer("rental_id").references(() => rentals.id),
    confirmationCode: varchar("confirmation_code", { length: 255 }),
    category: varchar("category", { length: 100 }),
    metadata: json("metadata").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at"),
  });
  
  // Favorites table
  export const favorites = pgTable(
    "favorites",
    {
      id: serial("id").primaryKey(),
      userId: integer("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      dumpsterId: integer("dumpster_id")
        .notNull()
        .references(() => dumpsters.id, { onDelete: "cascade" }),
      createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
      userIdIdx: index("user_id_idx").on(table.userId),
      dumpsterIdIdx: index("dumpster_id_idx").on(table.dumpsterId),
      userDumpsterIdx: uniqueIndex("favorites_user_dumpster_idx").on(
        table.userId,
        table.dumpsterId
      ),
    })
  );
  
  // Auth tables
  export const accounts = pgTable(
    "account",
    {
      id: serial("id"),
      userId: integer("userId")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      type: text("type").$type<AdapterAccount["type"]>().notNull(),
      provider: text("provider").notNull(),
      providerAccountId: text("providerAccountId").notNull(),
      refresh_token: text("refresh_token"),
      access_token: text("access_token"),
      expires_at: integer("expires_at"),
      token_type: text("token_type"),
      scope: text("scope"),
      id_token: text("id_token"),
      session_state: text("session_state"),
    },
    (account) => ({
      providerProviderAccountIdIdx: primaryKey({
        columns: [account.provider, account.providerAccountId],
      }),
    })
  );
  
  export const sessions = pgTable(
    "session",
    {
      id: serial("id"),
      sessionToken: text("sessionToken").notNull().unique(),
      userId: integer("userId")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      expires: timestamp("expires", { mode: "date" }).notNull(),
    },
    (session) => ({
      sessionTokenIdx: primaryKey({ columns: [session.sessionToken] }),
    })
  );
  
  export const verificationTokens = pgTable(
    "verificationToken",
    {
      id: serial("id"),
      identifier: text("identifier").notNull(),
      token: text("token").notNull(),
      expires: timestamp("expires", { mode: "date" }).notNull(),
    },
    (verificationToken) => ({
      identifierTokenIdx: primaryKey({
        columns: [verificationToken.identifier, verificationToken.token],
      }),
    })
  );
  
  // Email Verifications table
  export const emailVerifications = pgTable(
    "email_verifications",
    {
      id: serial("id").primaryKey(),
      userId: integer("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      token: varchar("token", { length: 255 }).notNull().unique(),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      expiresAt: timestamp("expires_at").notNull(),
      verifiedAt: timestamp("verified_at"),
    },
    (table) => ({
      userIdIdx: index("email_verifications_user_id_idx").on(table.userId),
      tokenIdx: index("email_verifications_token_idx").on(table.token),
    })
  );
  
  // Newsletter Subscriptions table
  export const newsletterSubscriptions = pgTable(
    "newsletter_subscriptions",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      email: varchar("email", { length: 255 }).notNull().unique(),
      name: varchar("name", { length: 100 }),
      isActive: boolean("is_active").notNull().default(true),
      unsubscribeToken: varchar("unsubscribe_token", { length: 255 }).notNull().unique(),
      source: varchar("source", { length: 50 }).default("footer"), // footer, popup, etc.
      metadata: json("metadata").$type<Record<string, any>>(),
      subscribedAt: timestamp("subscribed_at").notNull().defaultNow(),
      unsubscribedAt: timestamp("unsubscribed_at"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      emailIdx: index("newsletter_subscriptions_email_idx").on(table.email),
      isActiveIdx: index("newsletter_subscriptions_is_active_idx").on(table.isActive),
      unsubscribeTokenIdx: index("newsletter_subscriptions_unsubscribe_token_idx").on(table.unsubscribeToken),
    })
  );
  
  export const authenticators = pgTable(
    "authenticator",
    {
      id: serial("id"),
      credentialID: text("credentialID").notNull().unique(),
      userId: integer("userId")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      providerAccountId: text("providerAccountId").notNull(),
      credentialPublicKey: text("credentialPublicKey").notNull(),
      counter: integer("counter").notNull(),
      credentialDeviceType: text("credentialDeviceType").notNull(),
      credentialBackedUp: boolean("credentialBackedUp").notNull(),
      transports: text("transports"),
    },
    (authenticator) => ({
      userIdCredentialIDIdx: primaryKey({
        columns: [authenticator.userId, authenticator.credentialID],
      }),
    })
  );
  
  export const vendorSubscriptions = pgTable("vendor_subscriptions", {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  });
  
  // Vendor Usage table for tracking AI assistant minutes
  export const vendorUsage = pgTable("vendor_usage", {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    totalMinutes: decimal("total_minutes", { precision: 10, scale: 2 }).notNull().default("0.00"),
    includedMinutes: integer("included_minutes").notNull().default(300),
    overageMinutes: decimal("overage_minutes", { precision: 10, scale: 2 }).notNull().default("0.00"),
    billingCycleStart: timestamp("billing_cycle_start", { mode: "date" }).notNull(),
    billingCycleEnd: timestamp("billing_cycle_end", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }, (table) => ({
    vendorIdIdx: index("vendor_usage_vendor_id_idx").on(table.vendorId),
    billingCycleIdx: index("vendor_usage_billing_cycle_idx").on(table.billingCycleStart, table.billingCycleEnd),
  }));
  
  //===========================================================================
  // Vendor Address table
  export const vendorAddresses = pgTable(
    "vendor_addresses",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      vendorId: integer("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
      street: text("street").notNull(),
      city: text("city").notNull(),
      state: text("state").notNull(),
      zip: text("zip").notNull(),
      country: text("country").default("USA"),
      formattedAddress: text("formatted_address"),
      lat: decimal("lat", { precision: 9, scale: 6 }),
      lng: decimal("lng", { precision: 9, scale: 6 }),
      validated: boolean("validated").default(false),
      isDefault: boolean("is_default").default(false),
      isDispatchAddress: boolean("is_dispatch_address").default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      vendorIdIdx: index("vendor_addresses_vendor_id_idx").on(table.vendorId),
    })
  );
  
  // Delivery Address table
  export const deliveryAddresses = pgTable(
    "delivery_addresses",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      paymentIntentId: varchar("payment_intent_id", { length: 255 }).notNull(),
      street: text("street").notNull(),
      city: text("city").notNull(),
      state: text("state").notNull(),
      zip: text("zip").notNull(),
      country: text("country").default("USA"),
      formattedAddress: text("formatted_address"),
      lat: decimal("lat", { precision: 9, scale: 6 }),
      lng: decimal("lng", { precision: 9, scale: 6 }),
      validated: boolean("validated").default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      paymentIntentIdIdx: index("delivery_addresses_payment_intent_id_idx").on(
        table.paymentIntentId
      ),
    })
  );
  
  // Vendors table
  export const vendors = pgTable(
    "vendors",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      userId: integer("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" })
        .unique(),
      businessName: varchar("business_name", { length: 255 }).notNull(),
      marketplaceCommissionRate: decimal("marketplace_commission_rate", { precision: 10, scale: 2 }).notNull().default("15.00"),
      assistantCommissionRate: decimal("assistant_commission_rate", { precision: 10, scale: 2 }).notNull().default("3.00"),
      operatingHoursOpen: varchar("operating_hours_open", { length: 10 }), // e.g., "08:00"
      operatingHoursClose: varchar("operating_hours_close", { length: 10 }), // e.g., "17:00"
      timeZone: varchar("time_zone", { length: 50 }).default("America/New_York"),
      primaryPhone: varchar("primary_phone", { length: 20 }),
      secondaryPhone: varchar("secondary_phone", { length: 20 }),
      website: varchar("website", { length: 255 }),
      metaData: json("meta_data").$type<Record<string, any>>(),
      trashedPhoneNumber: varchar("trashed_phone_number", { length: 20 }),
      platformAgentId: varchar("platform_agent_id", { length: 255 }),
      stripeConnectAccountId: varchar("stripe_connect_account_id", {
        length: 255,
      }),
      stripeCustomerId: varchar("stripe_customer_id", { length: 255 }),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      userIdIdx: index("vendors_user_id_idx").on(table.userId),
    })
  );
  
  // Vendor Contacts table
  export const vendorContacts = pgTable(
    "vendor_contacts",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      vendorId: integer("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
      firstName: varchar("first_name", { length: 100 }).notNull(),
      lastName: varchar("last_name", { length: 100 }).notNull(),
      department: varchar("department", { length: 100 }),
      phone: varchar("phone", { length: 20 }), // Will inherit from vendor if not supplied
      extension: varchar("extension", { length: 10 }),
      notes: text("notes"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      vendorIdIdx: index("vendor_contacts_vendor_id_idx").on(table.vendorId),
    })
  );
  
  // Vendor Preferences table
  export const vendorPreferences = pgTable(
    "vendor_preferences",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      vendorId: integer("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" })
        .unique(),
      autoApproveOrders: boolean("auto_approve_orders").notNull().default(false),
      aiFeatures: boolean("ai_features").notNull().default(false),
      // Email notification preferences
      emailRentalStatusUpdates: boolean("email_rental_status_updates").notNull().default(true),
      emailInTransitNotifications: boolean("email_in_transit_notifications").notNull().default(true),
      emailDeliveredNotifications: boolean("email_delivered_notifications").notNull().default(true),
      emailPickupScheduledNotifications: boolean("email_pickup_scheduled_notifications").notNull().default(true),
      emailCompletedNotifications: boolean("email_completed_notifications").notNull().default(true),
      emailCancelledNotifications: boolean("email_cancelled_notifications").notNull().default(true),
      timezone: varchar("timezone", { length: 50 }).notNull().default("America/Detroit"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      vendorIdIdx: index("vendor_preferences_vendor_id_idx").on(table.vendorId),
    })
  );
  
  export const callForwardingVerifications = pgTable(
    "call_forwarding_verifications",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      vendorId: integer("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
      requestedByUserId: integer("requested_by_user_id")
        .references(() => users.id, { onDelete: "set null" }),
      phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
      verificationCodeHash: varchar("verification_code_hash", { length: 255 }),
      verified: boolean("verified").notNull().default(false),
      verifiedAt: timestamp("verified_at"),
      expiresAt: timestamp("expires_at"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      vendorIdx: index("call_forwarding_verifications_vendor_idx").on(table.vendorId),
    })
  );
  
  export const callForwardingEvents = pgTable(
    "call_forwarding_events",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      vendorId: integer("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
      requestedByUserId: integer("requested_by_user_id")
        .references(() => users.id, { onDelete: "set null" }),
      action: callForwardingActionEnum("action").notNull(),
      sourceType: callForwardingSourceEnum("source_type").notNull().default("primary"),
      sourcePhoneNumber: varchar("source_phone_number", { length: 20 }).notNull(),
      targetPhoneNumber: varchar("target_phone_number", { length: 20 }).notNull(),
      telLink: text("tel_link").notNull(),
      dialString: text("dial_string").notNull(),
      verificationId: integer("verification_id")
        .references(() => callForwardingVerifications.id, { onDelete: "set null" }),
      createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
      vendorIdx: index("call_forwarding_events_vendor_idx").on(table.vendorId),
    })
  );
  
  export type VendorPermissionSet = {
    dashboard: boolean;
    rentals: boolean;
    inventory: boolean;
    customers: boolean;
    billing: boolean;
    settings: boolean;
    driver: boolean;
    profile: boolean;
  };
  
  export const vendorTeamMembers = pgTable(
    "vendor_team_members",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      vendorId: integer("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
      userId: integer("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      role: vendorTeamRoleEnum("role").notNull(),
      permissions: json("permissions")
        .$type<VendorPermissionSet>()
        .notNull(),
      invitedByUserId: integer("invited_by_user_id")
        .references(() => users.id, { onDelete: "set null" }),
      phoneVerified: boolean("phone_verified").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      vendorUserIdx: uniqueIndex("vendor_team_members_vendor_user_idx").on(
        table.vendorId,
        table.userId
      ),
      vendorIdx: index("vendor_team_members_vendor_idx").on(table.vendorId),
      userIdx: index("vendor_team_members_user_idx").on(table.userId),
    })
  );
  
  export const vendorUserInvitations = pgTable(
    "vendor_user_invitations",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      vendorId: integer("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
      invitedByUserId: integer("invited_by_user_id")
        .references(() => users.id, { onDelete: "set null" }),
      email: varchar("email", { length: 255 }).notNull(),
      role: vendorTeamRoleEnum("role").notNull(),
      permissions: json("permissions")
        .$type<VendorPermissionSet>()
        .notNull(),
      status: vendorUserInvitationStatusEnum("status")
        .notNull()
        .default("pending"),
      token: varchar("token", { length: 255 }).notNull(),
      expiresAt: timestamp("expires_at", { mode: "date" }),
      acceptedAt: timestamp("accepted_at", { mode: "date" }),
      phoneNumber: varchar("phone_number", { length: 20 }),
      phoneVerificationCode: varchar("phone_verification_code", { length: 255 }),
      phoneVerificationExpiresAt: timestamp("phone_verification_expires_at", {
        mode: "date",
      }),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      vendorInvitationIdx: index("vendor_user_invitations_vendor_idx").on(
        table.vendorId
      ),
      tokenIdx: uniqueIndex("vendor_user_invitations_token_idx").on(table.token),
      emailIdx: index("vendor_user_invitations_email_idx").on(table.email),
    })
  );
  
  // User Preferences table - centralized user settings per user
  export const userPreferences = pgTable(
    "user_preferences",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      userId: integer("user_id")
        .notNull()
        .unique()
        .references(() => users.id, { onDelete: "cascade" }),
      operatorSpacebarToToggleMicrophone: boolean("operator_spacebar_to_toggle_microphone")
        .notNull()
        .default(false),
      operatorEnterToSendMessage: boolean("operator_enter_to_send_message")
        .notNull()
        .default(false),
      smsRentalStatusUpdates: boolean("sms_rental_status_updates")
        .notNull()
        .default(false),
      smsCallStartNotifications: boolean("sms_call_start_notifications")
        .notNull()
        .default(false),
      smsCallEndNotifications: boolean("sms_call_end_notifications")
        .notNull()
        .default(false),
      preferences: json("preferences")
        .$type<Record<string, unknown>>()
        .notNull(),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      userIdIdx: index("user_preferences_user_id_idx").on(table.userId),
    })
  );
  
  // Payment Methods table
  export const paymentMethods = pgTable(
    "payment_methods",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      userId: integer("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      type: paymentMethodTypeEnum("type").notNull(),
      stripeAccountId: varchar("stripe_account_id", { length: 255 }),
      stripePaymentMethodId: varchar("stripe_payment_method_id", { length: 255 }),
      isDefault: boolean("is_default").default(false),
      details: json("details").$type<{
        brand?: string;
        last4?: string;
        expMonth?: number;
        expYear?: number;
        bankName?: string;
        accountType?: string;
      }>(),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      userIdIdx: index("payment_methods_user_id_idx").on(table.userId),
    })
  );
  
  //===========================================================================
  // Relations
  //===========================================================================
  
  // User relations (consolidated with vendor relations)
  // moved below payments definition to avoid temporal dead zone when referencing `payments`
  
  export const userRolesRelations = relations(userRoles, ({ one }) => ({
    user: one(users, {
      fields: [userRoles.userId],
      references: [users.id],
    }),
  }));
  
  // Customer relations (now for the vendor-customer junction table)
  export const customersRelations = relations(customers, ({ one, many }) => ({
    vendorUser: one(users, {
      // The user who is the vendor in this relationship
      fields: [customers.vendorId],
      references: [users.id],
      relationName: "vendorInRelationship", // This links customers.vendorId to users.id
    }),
    customerUser: one(users, {
      // The user who is the customer in this relationship
      fields: [customers.userId], // Changed from customerId to userId
      references: [users.id],
      relationName: "customerInRelationship", // This links customers.userId to users.id
    }),
    rentals: many(rentals), // Rentals associated with this specific vendor-customer pair
  }));
  
  // Dumpster relations
  export const dumpstersRelations = relations(dumpsters, ({ one, many }) => ({
    vendor: one(vendors, {
      fields: [dumpsters.vendorId],
      references: [vendors.id],
    }),
    vendorAddress: one(vendorAddresses, {
      fields: [dumpsters.vendorAddressId],
      references: [vendorAddresses.id],
    }),
    rentals: many(rentals),
    rentalRates: many(dumpsterRentalRates),
    favorites: many(favorites),
    images: many(dumpsterImages),
  }));
  
  // Dumpster Images relations
  export const dumpsterImagesRelations = relations(dumpsterImages, ({ one }) => ({
    dumpster: one(dumpsters, {
      fields: [dumpsterImages.dumpsterId],
      references: [dumpsters.id],
    }),
  }));
  
  export const dumpsterRentalRatesRelations = relations(
    dumpsterRentalRates,
    ({ one }) => ({
      dumpster: one(dumpsters, {
        fields: [dumpsterRentalRates.dumpsterId],
        references: [dumpsters.id],
      }),
    })
  );
  
  // Dumpster Search Results relations
  export const dumpsterSearchResultsRelations = relations(dumpsterSearchResults, ({ one, many }) => ({
    rankings: many(searchResultRankings),
    rentals: many(rentals),
  }));
  
  // Search Result Rankings relations
  export const searchResultRankingsRelations = relations(searchResultRankings, ({ one }) => ({
    search: one(dumpsterSearchResults, {
      fields: [searchResultRankings.searchId],
      references: [dumpsterSearchResults.id],
    }),
    dumpster: one(dumpsters, {
      fields: [searchResultRankings.dumpsterId],
      references: [dumpsters.id],
    }),
    vendor: one(vendors, {
      fields: [searchResultRankings.vendorId],
      references: [vendors.id],
    }),
  }));
  
  // Rental relations
  export const rentalsRelations = relations(rentals, ({ one, many }) => ({
    // customerId in rentals now refers to the id in the 'customers' (junction) table
    vendorCustomerRelationship: one(customers, {
      fields: [rentals.customerId],
      references: [customers.id],
    }),
    dumpster: one(dumpsters, {
      fields: [rentals.dumpsterId],
      references: [dumpsters.id],
    }),
    selectedRate: one(dumpsterRentalRates, {
      fields: [rentals.dumpsterRentalRateId],
      references: [dumpsterRentalRates.id],
    }),
    search: one(dumpsterSearchResults, {
      fields: [rentals.searchId],
      references: [dumpsterSearchResults.id],
    }),
    supportTickets: many(supportTickets),
    deliveryAddress: one(deliveryAddresses, {
      fields: [rentals.paymentIntentId],
      references: [deliveryAddresses.paymentIntentId],
    }),
    history: many(rentalHistory),
    images: many(rentalImages),
    routeStops: many(routeStops),
  }));
  
  // Rental History relations
  export const rentalHistoryRelations = relations(rentalHistory, ({ one }) => ({
    rental: one(rentals, {
      fields: [rentalHistory.rentalId],
      references: [rentals.id],
    }),
  }));
  
  // Rental Images relations
  export const rentalImagesRelations = relations(rentalImages, ({ one }) => ({
    rental: one(rentals, {
      fields: [rentalImages.rentalId],
      references: [rentals.id],
    }),
  }));
  
  // Brokered Rental History relations
  export const brokeredRentalHistoryRelations = relations(brokeredRentalHistory, ({ one }) => ({
    brokeredRental: one(brokeredRentals, {
      fields: [brokeredRentalHistory.brokeredRentalId],
      references: [brokeredRentals.id],
    }),
  }));
  
  // Vendor Subscription relations
  export const vendorSubscriptionsRelations = relations(
    vendorSubscriptions,
    ({ one, many }) => ({
      vendor: one(vendors, {
        fields: [vendorSubscriptions.vendorId],
        references: [vendors.id],
      }),
    })
  );
  
  // Vendor Usage relations
  export const vendorUsageRelations = relations(vendorUsage, ({ one }) => ({
    vendor: one(vendors, {
      fields: [vendorUsage.vendorId],
      references: [vendors.id],
    }),
  }));
  
  // Support ticket relations
  export const supportTicketsRelations = relations(supportTickets, ({ one }) => ({
    user: one(users, {
      fields: [supportTickets.userId],
      references: [users.id],
    }),
    rental: one(rentals, {
      fields: [supportTickets.rentalId],
      references: [rentals.id],
    }),
  }));
  
  // Favorite relations
  export const favoritesRelations = relations(favorites, ({ one }) => ({
    user: one(users, {
      fields: [favorites.userId],
      references: [users.id],
    }),
    dumpster: one(dumpsters, {
      fields: [favorites.dumpsterId],
      references: [dumpsters.id],
    }),
  }));
  
  // Vendor Address relations
  export const vendorAddressesRelations = relations(
    vendorAddresses,
    ({ one, many }) => ({
      vendor: one(vendors, {
        fields: [vendorAddresses.vendorId],
        references: [vendors.id],
      }),
      dumpsters: many(dumpsters),
    })
  );
  
  // Delivery Address relations
  export const deliveryAddressesRelations = relations(
    deliveryAddresses,
    ({ one }) => ({
      rental: one(rentals, {
        fields: [deliveryAddresses.paymentIntentId],
        references: [rentals.paymentIntentId],
      }),
    })
  );
  
  // Email Verifications relations
  export const emailVerificationsRelations = relations(emailVerifications, ({ one }) => ({
    user: one(users, {
      fields: [emailVerifications.userId],
      references: [users.id],
    }),
  }));
  
  // Newsletter Subscriptions relations (no foreign keys, standalone table)
  export const newsletterSubscriptionsRelations = relations(newsletterSubscriptions, ({ }) => ({}));
  
  // Auth relations
  export const accountsRelations = relations(accounts, ({ one }) => ({
    user: one(users, {
      fields: [accounts.userId],
      references: [users.id],
    }),
  }));
  
  export const sessionsRelations = relations(sessions, ({ one }) => ({
    user: one(users, {
      fields: [sessions.userId],
      references: [users.id],
    }),
  }));
  
  export const authenticatorsRelations = relations(authenticators, ({ one }) => ({
    user: one(users, {
      fields: [authenticators.userId],
      references: [users.id],
    }),
  }));
  
  // Users relations (placed after `payments` are defined to avoid temporal issues)
  export const usersRelations = relations(users, ({ one, many }) => ({
    roles: many(userRoles),
    ownedVendor: one(vendors, {
      fields: [users.id],
      references: [vendors.userId],
      relationName: "ownedVendors",
    }),
    preferences: one(userPreferences, {
      fields: [users.id],
      references: [userPreferences.userId],
    }),
    vendorTeamMemberships: many(vendorTeamMembers, {
      relationName: "vendorTeamMemberUser",
    }),
    vendorInvitationsSent: many(vendorUserInvitations, {
      relationName: "vendorInvitationInviter",
    }),
    customerRelationships: many(customers, {
      relationName: "customerInRelationship",
    }),
    supportTickets: many(supportTickets),
    favorites: many(favorites),
    accounts: many(accounts),
    sessions: many(sessions),
    authenticators: many(authenticators),
    paymentMethods: many(paymentMethods),
    paymentsAsBuyer: many(payments, { relationName: "userPayments" }),
    emailVerifications: many(emailVerifications),
    notificationAlerts: many(notificationAlerts),
  }));
  
  // Payments table
  export const payments = pgTable(
    "payments",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
  
      // Rental this payment is for (nullable for subscription payments)
      rentalId: integer("rental_id")
        .references(() => rentals.id, { onDelete: "cascade" }),
  
      // User making the payment
      userId: integer("user_id")
        .notNull()
        .references(() => users.id),
  
      // Vendor receiving payment
      vendorId: integer("vendor_id")
        .notNull()
        .references(() => users.id),
  
      // Type of payment
      type: paymentTypeEnum("type").notNull(),
  
      // Payment details
      description: text("description").notNull(),
  
      // Payment breakdown
      baseAmount: decimal("base_amount", { precision: 10, scale: 2 }).notNull(),
      processingFee: decimal("processing_fee", {
        precision: 10,
        scale: 2,
      }).notNull(),
      platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).notNull(),
      totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
      vendorAmount: decimal("vendor_amount", {
        precision: 10,
        scale: 2,
      }).notNull(),
  
      // Stripe payment information
      stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
      stripeInvoiceId: varchar("stripe_invoice_id", { length: 255 }),
      stripeTransferId: varchar("stripe_transfer_id", { length: 255 }),
  
      // Payment status
      status: paymentStatusEnum("status").notNull().default("pending"),
  
      // Extension specific fields
      extensionDays: integer("extension_days"),
      newPickupDate: date("new_pickup_date"),
  
      // Metadata
      metadata: json("metadata").$type<Record<string, any>>(),
  
      // Audit fields
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      rentalIdIdx: index("payments_rental_id_idx").on(table.rentalId),
      userIdIdx: index("payments_user_id_idx").on(table.userId),
      vendorIdIdx: index("payments_vendor_id_idx").on(table.vendorId),
      statusIdx: index("payments_status_idx").on(table.status),
    })
  );
  
  // Payment relations
  export const paymentsRelations = relations(payments, ({ one }) => ({
    rental: one(rentals, {
      fields: [payments.rentalId],
      references: [rentals.id],
    }),
    user: one(users, {
      fields: [payments.userId],
      references: [users.id],
      relationName: "userPayments",
    }),
    vendor: one(users, {
      fields: [payments.vendorId],
      references: [users.id],
      relationName: "vendorPayments",
    }),
  }));
  
  
  // Payment Methods relations
  export const paymentMethodsRelations = relations(paymentMethods, ({ one }) => ({
    user: one(users, {
      // A payment method belongs to a user
      fields: [paymentMethods.userId],
      references: [users.id],
    }),
  }));
  
  // Vendor relations
  export const vendorsRelations = relations(vendors, ({ one, many }) => ({
    owner: one(users, {
      fields: [vendors.userId],
      references: [users.id],
      relationName: "ownedVendors",
    }),
    dumpsters: many(dumpsters),
    vendorAddresses: many(vendorAddresses),
    contacts: many(vendorContacts),
    subscriptions: many(vendorSubscriptions),
    preferences: one(vendorPreferences),
    usage: many(vendorUsage),
    teamMembers: many(vendorTeamMembers),
    invitations: many(vendorUserInvitations),
    driverRoutes: many(driverRoutes),
  }));
  
  // Vendor Contacts relations
  export const vendorContactsRelations = relations(vendorContacts, ({ one }) => ({
    vendor: one(vendors, {
      fields: [vendorContacts.vendorId],
      references: [vendors.id],
    }),
  }));
  
  // Vendor Preferences relations
  export const vendorPreferencesRelations = relations(vendorPreferences, ({ one }) => ({
    vendor: one(vendors, {
      fields: [vendorPreferences.vendorId],
      references: [vendors.id],
    }),
  }));
  
  export const vendorTeamMembersRelations = relations(
    vendorTeamMembers,
    ({ one, many }) => ({
      vendor: one(vendors, {
        fields: [vendorTeamMembers.vendorId],
        references: [vendors.id],
      }),
      user: one(users, {
        fields: [vendorTeamMembers.userId],
        references: [users.id],
        relationName: "vendorTeamMemberUser",
      }),
      invitedBy: one(users, {
        fields: [vendorTeamMembers.invitedByUserId],
        references: [users.id],
        relationName: "vendorTeamInviter",
      }),
      driverRoutes: many(driverRoutes),
    })
  );
  
  export const vendorUserInvitationsRelations = relations(
    vendorUserInvitations,
    ({ one }) => ({
      vendor: one(vendors, {
        fields: [vendorUserInvitations.vendorId],
        references: [vendors.id],
      }),
      invitedBy: one(users, {
        fields: [vendorUserInvitations.invitedByUserId],
        references: [users.id],
        relationName: "vendorInvitationInviter",
      }),
    })
  );
  
  export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
    user: one(users, {
      fields: [userPreferences.userId],
      references: [users.id],
    }),
  }));
  
  //===========================================================================
  // Type Exports
  //===========================================================================
  export type Payment = typeof payments.$inferSelect;
  export type NewPayment = typeof payments.$inferInsert;
  
  export type Customer = typeof customers.$inferSelect;
  export type NewCustomer = typeof customers.$inferInsert;
  
  export type VendorAddress = typeof vendorAddresses.$inferSelect;
  export type NewVendorAddress = typeof vendorAddresses.$inferInsert;
  
  export type DeliveryAddress = typeof deliveryAddresses.$inferSelect;
  export type NewDeliveryAddress = typeof deliveryAddresses.$inferInsert;
  
  export type User = typeof users.$inferSelect;
  export type UserWithRoles = typeof users.$inferSelect & {
    roles: Array<typeof userRoles.$inferSelect>;
  };
  export type NewUser = typeof users.$inferInsert;
  
  export type SupportTicket = typeof supportTickets.$inferSelect;
  export type NewSupportTicket = typeof supportTickets.$inferInsert;
  
  export type Dumpster = typeof dumpsters.$inferSelect;
  export type NewDumpster = typeof dumpsters.$inferInsert;
  
  export type DumpsterRentalRate = typeof dumpsterRentalRates.$inferSelect;
  export type NewDumpsterRentalRate = typeof dumpsterRentalRates.$inferInsert;
  
  export type DumpsterImage = typeof dumpsterImages.$inferSelect;
  export type NewDumpsterImage = typeof dumpsterImages.$inferInsert;
  
  export type DumpsterSearchResult = typeof dumpsterSearchResults.$inferSelect;
  export type NewDumpsterSearchResult = typeof dumpsterSearchResults.$inferInsert;
  
  export type SearchResultRanking = typeof searchResultRankings.$inferSelect;
  export type NewSearchResultRanking = typeof searchResultRankings.$inferInsert;
  
  export type Rental = typeof rentals.$inferSelect;
  export type NewRental = typeof rentals.$inferInsert;
  
  export type RentalHistory = typeof rentalHistory.$inferSelect;
  export type NewRentalHistory = typeof rentalHistory.$inferInsert;
  
  export type RentalImage = typeof rentalImages.$inferSelect;
  export type NewRentalImage = typeof rentalImages.$inferInsert;
  
  // Legacy type definitions for backward compatibility
  export type Booking = Rental;
  export type NewBooking = NewRental;
  
  export type Favorite = typeof favorites.$inferSelect;
  export type NewFavorite = typeof favorites.$inferInsert;
  
  export type Account = typeof accounts.$inferSelect;
  export type Session = typeof sessions.$inferSelect;
  export type VerificationToken = typeof verificationTokens.$inferSelect;
  export type Authenticator = typeof authenticators.$inferSelect;
  
  export type PaymentMethod = typeof paymentMethods.$inferSelect;
  export type NewPaymentMethod = typeof paymentMethods.$inferInsert;
  
  export type Vendor = typeof vendors.$inferSelect;
  export type NewVendor = typeof vendors.$inferInsert;
  
  export type VendorContact = typeof vendorContacts.$inferSelect;
  export type NewVendorContact = typeof vendorContacts.$inferInsert;
  
  export type VendorPreferences = typeof vendorPreferences.$inferSelect;
  export type NewVendorPreferences = typeof vendorPreferences.$inferInsert;
  export type UserPreferences = typeof userPreferences.$inferSelect;
  export type NewUserPreferences = typeof userPreferences.$inferInsert;
  export type VendorTeamMember = typeof vendorTeamMembers.$inferSelect;
  export type NewVendorTeamMember = typeof vendorTeamMembers.$inferInsert;
  export type VendorUserInvitation = typeof vendorUserInvitations.$inferSelect;
  export type NewVendorUserInvitation = typeof vendorUserInvitations.$inferInsert;
  
  export type VendorSubscription = typeof vendorSubscriptions.$inferSelect;
  export type NewVendorSubscription = typeof vendorSubscriptions.$inferInsert;
  
  export type VendorUsage = typeof vendorUsage.$inferSelect;
  export type NewVendorUsage = typeof vendorUsage.$inferInsert;
  export type VendorUpdatableFields = Pick<
    Vendor,
    | "businessName"
    | "primaryPhone"
    | "secondaryPhone"
    | "website"
    | "operatingHoursOpen"
    | "operatingHoursClose"
    | "timeZone"
  >;
  export type VendorWithOwner = Vendor & { owner?: User | null };
  
  export type UserRole = (typeof userRoleEnum.enumValues)[number];
  export type DumpsterType = (typeof dumpsterTypeEnum.enumValues)[number];
  
  export type NewsletterSubscription = typeof newsletterSubscriptions.$inferSelect;
  export type NewNewsletterSubscription = typeof newsletterSubscriptions.$inferInsert;
  
  //===========================================================================
  // Brokered Tables for Fallback/Manual Brokerage Orders
  //===========================================================================
  
  // Brokered dumpsters table for fallback orders
  export const brokeredDumpsters = pgTable("brokered_dumpsters", {
    id: serial("id").primaryKey(),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => uuidv4()),
    description: text("description").notNull(),
    size: decimal("size", { precision: 3, scale: 1 }).notNull(),
    type: dumpsterTypeEnum("type").notNull(),
    price: decimal("price", { precision: 10, scale: 2 }).notNull(),
    weightLimit: integer("weight_limit").notNull(),
    dimensions: json("dimensions").$type<{
      length: number;
      width: number;
      height: number;
    }>(),
    recommendedFor: text("recommended_for").notNull(),
    acceptedMaterials: json("accepted_materials").$type<string[]>(),
    prohibitedMaterials: json("prohibited_materials").$type<string[]>(),
    extraDayPrice: decimal("extra_day_price", {
      precision: 10,
      scale: 2,
    }).notNull(),
    // Fallback-specific data
    location: json("location").$type<{
      lat: number;
      lng: number;
      address: string;
    }>().notNull(),
    customerInfo: json("customer_info").$type<{
      name?: string;
      email?: string;
      phone?: string;
    }>(),
    pricing: json("pricing").$type<{
      suggested: string;
      range: string;
    }>().notNull(),
    closestCity: json("closest_city").$type<{
      city: string;
      state: string;
      distance: number;
    }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  });
  
  // Brokered rentals table for fallback orders
  export const brokeredRentals = pgTable("brokered_rentals", {
    id: serial("id").primaryKey(),
    uuid: text("uuid")
      .notNull()
      .unique()
      .$defaultFn(() => uuidv4()),
    brokeredDumpsterId: integer("brokered_dumpster_id")
      .notNull()
      .references(() => brokeredDumpsters.id),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    status: rentalStatusEnum("status").notNull().default("pending"),
    deliveryDate: date("delivery_date", { mode: "date" }).notNull(),
    pickupDate: date("pickup_date", { mode: "date" }).notNull(),
    totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
    paymentIntentId: varchar("payment_intent_id", { length: 255 }),
    confirmed: boolean("confirmed").notNull().default(false),
    confirmedAt: timestamp("confirmed_at", { mode: "date" }),
    vendorConfirmationToken: varchar("vendor_confirmation_token", {
      length: 255,
    }),
    // Support notification tracking
    supportNotificationSent: boolean("support_notification_sent").notNull().default(false),
    supportNotificationSentAt: timestamp("support_notification_sent_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date", precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", precision: 3 })
      .notNull()
      .defaultNow(),
    notes: text("notes"),
    confirmationCode: varchar("confirmation_code", { length: 255 }),
  });
  
  // Notification Alerts table
  export const notificationAlerts = pgTable(
    "notification_alerts",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      userId: integer("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      type: varchar("type", { length: 50 }).notNull(), // e.g., 'import_queued', 'import_complete', etc.
      title: text("title").notNull(),
      body: text("body").notNull(),
      imageUrl: text("image_url"),
      deepLink: text("deep_link"), // Link to relevant page
      data: json("data").$type<Record<string, unknown>>(), // Additional notification data
      isRead: boolean("is_read").notNull().default(false),
      readAt: timestamp("read_at", { mode: "date" }),
      sentAt: timestamp("sent_at", { mode: "date" }),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      userIdIdx: index("notification_alerts_user_id_idx").on(table.userId),
      isReadIdx: index("notification_alerts_is_read_idx").on(table.isRead),
      createdAtIdx: index("notification_alerts_created_at_idx").on(table.createdAt),
      userReadIdx: index("notification_alerts_user_read_idx").on(table.userId, table.isRead),
    })
  );
  
  // Customer Import Jobs table
  export const customerImportJobs = pgTable(
    "customer_import_jobs",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      vendorId: integer("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
      userId: integer("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      status: customerImportJobStatusEnum("status")
        .notNull()
        .default("queued"),
      totalRows: integer("total_rows").notNull(),
      importedCount: integer("imported_count").notNull().default(0),
      skippedCount: integer("skipped_count").notNull().default(0),
      warnings: json("warnings").$type<
        Array<{ type: "warning"; message: string; context?: Record<string, unknown> }>
      >().default([]),
      messages: json("messages").$type<
        Array<{ type: "info"; message: string; context?: Record<string, unknown> }>
      >().default([]),
      errors: json("errors").$type<
        Array<{ type: "error"; message: string; context?: Record<string, unknown> }>
      >().default([]),
      importId: text("import_id").notNull(),
      notificationUuid: text("notification_uuid"),
      startedAt: timestamp("started_at", { mode: "date" }),
      completedAt: timestamp("completed_at", { mode: "date" }),
      failedAt: timestamp("failed_at", { mode: "date" }),
      errorMessage: text("error_message"),
      metadata: json("metadata").$type<Record<string, unknown>>(),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      vendorIdIdx: index("customer_import_jobs_vendor_id_idx").on(table.vendorId),
      userIdIdx: index("customer_import_jobs_user_id_idx").on(table.userId),
      statusIdx: index("customer_import_jobs_status_idx").on(table.status),
      createdAtIdx: index("customer_import_jobs_created_at_idx").on(table.createdAt),
      notificationUuidIdx: index("customer_import_jobs_notification_uuid_idx").on(
        table.notificationUuid
      ),
    })
  );
  
  // Active Calls table - Track live calls with monitor/control URLs
  export const activeCalls = pgTable(
    "active_calls",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      callId: varchar("call_id", { length: 255 }).notNull().unique(), // Vapi call ID
      vendorId: integer("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
      customerPhone: varchar("customer_phone", { length: 20 }),
      customerName: varchar("customer_name", { length: 255 }),
      monitorListenUrl: text("monitor_listen_url"), // WebRTC URL for listening
      monitorControlUrl: text("monitor_control_url"), // Control URL for mute/unmute
      status: activeCallStatusEnum("status").notNull().default("in-progress"),
      interventionState: interventionStateEnum("intervention_state").default("AI-lead"),
      startedAt: timestamp("started_at", { mode: "date" }).notNull().defaultNow(),
      endedAt: timestamp("ended_at", { mode: "date" }),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      callIdIdx: index("active_calls_call_id_idx").on(table.callId),
      vendorIdIdx: index("active_calls_vendor_id_idx").on(table.vendorId),
      statusIdx: index("active_calls_status_idx").on(table.status),
    })
  );
  
  // Call Interventions table - Log all intervention events
  export const callInterventions = pgTable(
    "call_interventions",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      activeCallId: integer("active_call_id")
        .notNull()
        .references(() => activeCalls.id, { onDelete: "cascade" }),
      intervenorUserId: integer("intervenor_user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      interventionType: interventionTypeEnum("intervention_type").notNull(),
      interventionMethod: interventionMethodEnum("intervention_method").notNull(),
      durationSeconds: integer("duration_seconds"), // Duration of intervention in seconds
      metadata: json("metadata").$type<Record<string, unknown>>(), // Additional context data
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      activeCallIdIdx: index("call_interventions_active_call_id_idx").on(table.activeCallId),
      intervenorUserIdIdx: index("call_interventions_intervenor_user_id_idx").on(table.intervenorUserId),
      createdAtIdx: index("call_interventions_created_at_idx").on(table.createdAt),
    })
  );
  
  // Driver Routes table - Main route container
  export const driverRoutes = pgTable(
    "driver_routes",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      vendorId: integer("vendor_id")
        .notNull()
        .references(() => vendors.id, { onDelete: "cascade" }),
      driverId: integer("driver_id")
        .references(() => vendorTeamMembers.id, { onDelete: "set null" }),
      scheduledDate: date("scheduled_date", { mode: "date" }).notNull(),
      status: routeStatusEnum("status").notNull().default("pending"),
      estimatedStartTime: timestamp("estimated_start_time", { mode: "date" }),
      actualStartTime: timestamp("actual_start_time", { mode: "date" }),
      estimatedEndTime: timestamp("estimated_end_time", { mode: "date" }),
      actualEndTime: timestamp("actual_end_time", { mode: "date" }),
      totalStops: integer("total_stops").notNull().default(0),
      completedStops: integer("completed_stops").notNull().default(0),
      totalDistance: decimal("total_distance", { precision: 10, scale: 2 }), // km
      estimatedDuration: integer("estimated_duration"), // minutes
      notes: text("notes"),
      optimizedOrder: json("optimized_order").$type<string[]>(), // JSON array of stop IDs in optimized sequence
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      vendorIdIdx: index("driver_routes_vendor_id_idx").on(table.vendorId),
      driverIdIdx: index("driver_routes_driver_id_idx").on(table.driverId),
      scheduledDateIdx: index("driver_routes_scheduled_date_idx").on(table.scheduledDate),
      statusIdx: index("driver_routes_status_idx").on(table.status),
    })
  );
  
  // Route Stops table - Individual stops within a route
  export const routeStops = pgTable(
    "route_stops",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      routeId: integer("route_id")
        .notNull()
        .references(() => driverRoutes.id, { onDelete: "cascade" }),
      rentalId: integer("rental_id")
        .references(() => rentals.id, { onDelete: "set null" }),
      stopType: stopTypeEnum("stop_type").notNull(),
      sequenceOrder: integer("sequence_order").notNull(),
      address: text("address").notNull(),
      lat: decimal("lat", { precision: 9, scale: 6 }),
      lng: decimal("lng", { precision: 9, scale: 6 }),
      scheduledArrivalTime: timestamp("scheduled_arrival_time", { mode: "date" }),
      actualArrivalTime: timestamp("actual_arrival_time", { mode: "date" }),
      actualDepartureTime: timestamp("actual_departure_time", { mode: "date" }),
      status: stopStatusEnum("status").notNull().default("pending"),
      customerName: varchar("customer_name", { length: 255 }),
      customerPhone: varchar("customer_phone", { length: 20 }),
      confirmationCode: varchar("confirmation_code", { length: 255 }),
      notes: text("notes"),
      specialInstructions: text("special_instructions"),
      createdAt: timestamp("created_at").notNull().defaultNow(),
      updatedAt: timestamp("updated_at").notNull().defaultNow(),
    },
    (table) => ({
      routeIdIdx: index("route_stops_route_id_idx").on(table.routeId),
      rentalIdIdx: index("route_stops_rental_id_idx").on(table.rentalId),
      sequenceOrderIdx: index("route_stops_sequence_order_idx").on(table.sequenceOrder),
      statusIdx: index("route_stops_status_idx").on(table.status),
    })
  );
  
  // Route Optimizations table - AI-generated optimization suggestions
  export const routeOptimizations = pgTable(
    "route_optimizations",
    {
      id: serial("id").primaryKey(),
      uuid: text("uuid")
        .notNull()
        .unique()
        .$defaultFn(() => uuidv4()),
      routeId: integer("route_id")
        .notNull()
        .references(() => driverRoutes.id, { onDelete: "cascade" }),
      suggestedOrder: json("suggested_order").$type<string[]>().notNull(), // JSON array of stop IDs
      estimatedTimeSavings: integer("estimated_time_savings"), // minutes
      estimatedDistanceSavings: decimal("estimated_distance_savings", { precision: 10, scale: 2 }), // km
      optimizationType: optimizationTypeEnum("optimization_type").notNull(),
      confidenceScore: decimal("confidence_score", { precision: 5, scale: 2 }), // 0-100
      applied: boolean("applied").notNull().default(false),
      createdAt: timestamp("created_at").notNull().defaultNow(),
    },
    (table) => ({
      routeIdIdx: index("route_optimizations_route_id_idx").on(table.routeId),
      appliedIdx: index("route_optimizations_applied_idx").on(table.applied),
    })
  );
  
  // Relations for brokered tables
  export const brokeredDumpstersRelations = relations(brokeredDumpsters, ({ many }) => ({
    brokeredRentals: many(brokeredRentals),
  }));
  
  export const brokeredRentalsRelations = relations(brokeredRentals, ({ one, many }) => ({
    brokeredDumpster: one(brokeredDumpsters, {
      fields: [brokeredRentals.brokeredDumpsterId],
      references: [brokeredDumpsters.id],
    }),
    customer: one(customers, {
      fields: [brokeredRentals.customerId],
      references: [customers.id],
    }),
    history: many(brokeredRentalHistory),
  }));
  
  export const notificationAlertsRelations = relations(notificationAlerts, ({ one }) => ({
    user: one(users, {
      fields: [notificationAlerts.userId],
      references: [users.id],
    }),
  }));
  
  export const customerImportJobsRelations = relations(customerImportJobs, ({ one }) => ({
    vendor: one(vendors, {
      fields: [customerImportJobs.vendorId],
      references: [vendors.id],
    }),
    user: one(users, {
      fields: [customerImportJobs.userId],
      references: [users.id],
    }),
  }));
  
  // Active Calls relations
  export const activeCallsRelations = relations(activeCalls, ({ one, many }) => ({
    vendor: one(vendors, {
      fields: [activeCalls.vendorId],
      references: [vendors.id],
    }),
    interventions: many(callInterventions),
  }));
  
  // Call Interventions relations
  export const callInterventionsRelations = relations(callInterventions, ({ one }) => ({
    activeCall: one(activeCalls, {
      fields: [callInterventions.activeCallId],
      references: [activeCalls.id],
    }),
    intervenor: one(users, {
      fields: [callInterventions.intervenorUserId],
      references: [users.id],
    }),
  }));
  
  // Driver Routes relations
  export const driverRoutesRelations = relations(driverRoutes, ({ one, many }) => ({
    vendor: one(vendors, {
      fields: [driverRoutes.vendorId],
      references: [vendors.id],
    }),
    driver: one(vendorTeamMembers, {
      fields: [driverRoutes.driverId],
      references: [vendorTeamMembers.id],
    }),
    stops: many(routeStops),
    optimizations: many(routeOptimizations),
  }));
  
  // Route Stops relations
  export const routeStopsRelations = relations(routeStops, ({ one }) => ({
    route: one(driverRoutes, {
      fields: [routeStops.routeId],
      references: [driverRoutes.id],
    }),
    rental: one(rentals, {
      fields: [routeStops.rentalId],
      references: [rentals.id],
    }),
  }));
  
  // Route Optimizations relations
  export const routeOptimizationsRelations = relations(routeOptimizations, ({ one }) => ({
    route: one(driverRoutes, {
      fields: [routeOptimizations.routeId],
      references: [driverRoutes.id],
    }),
  }));
  
  // Type exports for brokered tables
  export type BrokeredDumpster = typeof brokeredDumpsters.$inferSelect;
  export type NewBrokeredDumpster = typeof brokeredDumpsters.$inferInsert;
  export type BrokeredRental = typeof brokeredRentals.$inferSelect;
  export type NewBrokeredRental = typeof brokeredRentals.$inferInsert;
  export type BrokeredRentalHistory = typeof brokeredRentalHistory.$inferSelect;
  export type NewBrokeredRentalHistory = typeof brokeredRentalHistory.$inferInsert;
  export type CustomerImportJob = typeof customerImportJobs.$inferSelect;
  export type NewCustomerImportJob = typeof customerImportJobs.$inferInsert;
  export type CustomerImportJobStatus = (typeof customerImportJobStatusEnum.enumValues)[number];
  export type NotificationAlert = typeof notificationAlerts.$inferSelect;
  export type NewNotificationAlert = typeof notificationAlerts.$inferInsert;
  
  export type ActiveCall = typeof activeCalls.$inferSelect;
  export type NewActiveCall = typeof activeCalls.$inferInsert;
  export type ActiveCallStatus = (typeof activeCallStatusEnum.enumValues)[number];
  export type InterventionState = (typeof interventionStateEnum.enumValues)[number];
  
  export type CallIntervention = typeof callInterventions.$inferSelect;
  export type NewCallIntervention = typeof callInterventions.$inferInsert;
  export type InterventionType = (typeof interventionTypeEnum.enumValues)[number];
  export type InterventionMethod = (typeof interventionMethodEnum.enumValues)[number];
  
  export type DriverRoute = typeof driverRoutes.$inferSelect;
  export type NewDriverRoute = typeof driverRoutes.$inferInsert;
  export type RouteStatus = (typeof routeStatusEnum.enumValues)[number];
  
  export type RouteStop = typeof routeStops.$inferSelect;
  export type NewRouteStop = typeof routeStops.$inferInsert;
  export type StopStatus = (typeof stopStatusEnum.enumValues)[number];
  export type StopType = (typeof stopTypeEnum.enumValues)[number];
  
  export type RouteOptimization = typeof routeOptimizations.$inferSelect;
  export type NewRouteOptimization = typeof routeOptimizations.$inferInsert;
  export type OptimizationType = (typeof optimizationTypeEnum.enumValues)[number];
  
  //===========================================================================
  // Brokered Rental Interface Definitions
  //===========================================================================
  
  // Location interface for brokered dumpsters
  export interface BrokeredLocation {
    lat: number;
    lng: number;
    address: string;
  }
  
  // Customer info interface for brokered dumpsters
  export interface BrokeredCustomerInfo {
    name?: string;
    email?: string;
    phone?: string;
  }
  
  // Pricing interface for brokered dumpsters
  export interface BrokeredPricing {
    suggested: string;
    range: string;
  }
  
  // Closest city interface for brokered dumpsters
  export interface BrokeredClosestCity {
    city: string;
    state: string;
    distance: number;
  }
  
  // Dimensions interface
  export interface BrokeredDimensions {
    length: number;
    width: number;
    height: number;
  }
  
  // Brokered dumpster with all related data
  export interface BrokeredDumpsterWithDetails extends BrokeredDumpster {
    brokeredRentals: BrokeredRental[];
  }
  
  // Brokered rental with related data
  export interface BrokeredRentalWithDetails extends BrokeredRental {
    brokeredDumpster: BrokeredDumpster;
    customer: Customer & {
      customerUser: User;
    };
  }
  
  // Brokered rental action result interface
  export interface BrokeredRentalActionResult {
    success: boolean;
    message?: string;
    error?: string;
    rental?: BrokeredRental;
  }
  
  // Vendor assignment data interface
  export interface VendorAssignmentData {
    name: string;
    email: string;
    password: string;
    phone: string;
    businessName: string;
    operatingHoursOpen?: string;
    operatingHoursClose?: string;
    timeZone?: string;
    website?: string;
  }
  
  // Brokered rental assignment result
  export interface BrokeredRentalAssignmentResult {
    result: BrokeredRentalActionResult;
    vendor?: Vendor;
  }
  
  // Brokered rental status type
  export type BrokeredRentalStatus = 'pending' | 'confirmed' | 'denied' | 'cancelled' | 'assigned';
  
  // Brokered rental action type
  export type BrokeredRentalAction = 'confirm' | 'deny' | 'assign' | 'cancel';
  
  // Brokered rental action request interface
  export interface BrokeredRentalActionRequest {
    action: BrokeredRentalAction;
    vendorData?: VendorAssignmentData;
    reason?: string;
  }
  
  // Brokered rental action response interface
  export interface BrokeredRentalActionResponse {
    success: boolean;
    message?: string;
    rental?: BrokeredRental;
    vendor?: Vendor;
    error?: string;
  }
  
  // Brokered dumpster search result interface
  export interface BrokeredDumpsterSearchResult extends BrokeredDumpster {
    distanceMiles?: number;
    closestVendorAddress?: {
      street: string;
      city: string;
      state: string;
      zip: string;
      lat: number;
      lng: number;
    };
  }
  
  // Brokered rental list item interface (for UI components)
  export interface BrokeredRentalListItem {
    id: number;
    uuid: string;
    status: string;
    deliveryDate: string;
    pickupDate: string;
    totalPrice: string;
    confirmationCode: string;
    supportNotificationSent: boolean;
    supportNotificationSentAt: string | null;
    createdAt: string;
    updatedAt: string;
    brokeredDumpster: {
      id: number;
      uuid: string;
      description: string;
      size: number;
      type: string;
      price: string;
      location: BrokeredLocation;
      customerInfo: BrokeredCustomerInfo;
      pricing: BrokeredPricing;
      closestCity: BrokeredClosestCity | null;
    };
    customer: {
      id: number;
      name: string;
      email: string;
      phone: string | null;
    };
    user: {
      id: number;
      uuid: string;
      name: string;
      email: string;
    };
  }
  