/**
 * Shopping session models
 * Defines shopping session-related entity types
 */

import { BaseRecord } from "./index";

/**
 * Shopping session status
 */
export enum ShoppingSessionStatus {
  /**
   * Session is currently active
   */
  ACTIVE = "active",

  /**
   * Session is paused
   */
  PAUSED = "paused",

  /**
   * Session is completed
   */
  COMPLETED = "completed",
}

/**
 * Product page shown
 */
export type ProductPage = "title" | "pricing" | "both";

/**
 * Product shopping session
 * Represents a shopping session for a user
 */
export interface ProductShoppingSession extends BaseRecord {
  /**
   * Session ID
   */
  session_id: number;

  /**
   * User ID
   */
  user_id: number;

  /**
   * ProductCategory ID (optional - if session is for a specific category)
   */
  category_id?: number;

  /**
   * Session start time
   */
  start_time: string;

  /**
   * Last activity time (used to detect inactivity)
   */
  last_activity_time: string;

  /**
   * Session end time
   */
  end_time?: string;

  /**
   * Session status
   */
  status: ShoppingSessionStatus;

  /**
   * Number of cards studied in this session
   */
  cards_studied: number;

  /**
   * Current position in the deck
   */
  current_card_index: number;

  /**
   * Total shopping time in seconds
   */
  total_shopping_time: number;

  /**
   * JSON string of card IDs in the order they're being studied
   */
  cards_order?: string;
}

/**
 * Product view record
 * Details of individual card views within a session
 */
export interface ProductViewRecord extends BaseRecord {
  /**
   * Record ID
   */
  record_id: number;

  /**
   * Session ID
   */
  session_id: number;

  /**
   * User ID
   */
  user_id: number;

  /**
   * Product ID
   */
  product_id: number;

  /**
   * When user started viewing this card
   */
  view_start: string;

  /**
   * When user moved to next card
   */
  view_end?: string;

  /**
   * Time in seconds spent on card
   */
  view_time?: number;

  /**
   * Which page(s) were viewed
   */
  page_shown: ProductPage;

  /**
   * Whether the hint was viewed
   */
  hint_viewed: boolean;
}

/**
 * User product preferences
 * User settings for product shopping
 */
export interface UserProductPreferences {
  /**
   * Preference ID
   */
  preference_id: number;

  /**
   * User ID
   */
  user_id: number;

  /**
   * Default view mode
   */
  default_view: "all" | "bookmarked";

  /**
   * Whether to automatically shuffle cards
   */
  auto_shuffle?: boolean;

  /**
   * Whether to show hints by default
   */
  show_hints?: boolean;

  /**
   * Seconds of inactivity before pausing session
   */
  inactivity_timeout?: number;

  /**
   * Maximum cards per session
   */
  cards_per_session?: number;
}

/**
 * Shopping session with records
 * Session combined with view records
 */
export interface ShoppingSessionWithRecords {
  /**
   * The shopping session
   */
  session: ProductShoppingSession;

  /**
   * View records with title and pricing
   */
  records: Array<
    ProductViewRecord & {
      title: string;
      pricing: string;
    }
  >;
}

/**
 * ProductShoppingSession mapping for ORM
 */
export const ProductShoppingSessionMapping = {
  entity: "ProductShoppingSession",
  table: "product_shopping_session",
  idField: "session_id",
  columns: [
    {
      logical: "session_id",
      physical: "session_id",
      primaryKey: true,
      autoIncrement: true,
    },
    { logical: "user_id", physical: "user_id" },
    {
      logical: "category_id",
      physical: "category_id",
      nullable: true,
    },
    { logical: "start_time", physical: "start_time" },
    { logical: "last_activity_time", physical: "last_activity_time" },
    { logical: "end_time", physical: "end_time", nullable: true },
    { logical: "status", physical: "status" },
    { logical: "cards_studied", physical: "cards_studied" },
    { logical: "current_card_index", physical: "current_card_index" },
    { logical: "total_shopping_time", physical: "total_shopping_time" },
    { logical: "cards_order", physical: "cards_order", nullable: true },
    { logical: "created_at", physical: "created_at" },
    { logical: "updated_at", physical: "updated_at" },
  ],
  relations: [
    {
      name: "user",
      type: "manyToOne",
      sourceEntity: "ProductShoppingSession",
      targetEntity: "User",
      sourceColumn: "user_id",
      targetColumn: "user_id",
    },
    {
      name: "category",
      type: "manyToOne",
      sourceEntity: "ProductShoppingSession",
      targetEntity: "ProductCategory",
      sourceColumn: "category_id",
      targetColumn: "category_id",
    },
    {
      name: "viewRecords",
      type: "oneToMany",
      sourceEntity: "ProductShoppingSession",
      targetEntity: "ProductViewRecord",
      sourceColumn: "session_id",
      targetColumn: "session_id",
    },
  ],
  timestamps: {
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
};

/**
 * ProductViewRecord mapping for ORM
 */
export const ProductViewRecordMapping = {
  entity: "ProductViewRecord",
  table: "product_view_record",
  idField: "record_id",
  columns: [
    {
      logical: "record_id",
      physical: "record_id",
      primaryKey: true,
      autoIncrement: true,
    },
    { logical: "session_id", physical: "session_id" },
    { logical: "user_id", physical: "user_id" },
    { logical: "product_id", physical: "product_id" },
    { logical: "view_start", physical: "view_start" },
    { logical: "view_end", physical: "view_end", nullable: true },
    { logical: "view_time", physical: "view_time", nullable: true },
    { logical: "page_shown", physical: "page_shown" },
    { logical: "hint_viewed", physical: "hint_viewed" },
    { logical: "created_at", physical: "created_at" },
  ],
  relations: [
    {
      name: "session",
      type: "manyToOne",
      sourceEntity: "ProductViewRecord",
      targetEntity: "ProductShoppingSession",
      sourceColumn: "session_id",
      targetColumn: "session_id",
    },
    {
      name: "user",
      type: "manyToOne",
      sourceEntity: "ProductViewRecord",
      targetEntity: "User",
      sourceColumn: "user_id",
      targetColumn: "user_id",
    },
    {
      name: "product",
      type: "manyToOne",
      sourceEntity: "ProductViewRecord",
      targetEntity: "Product",
      sourceColumn: "product_id",
      targetColumn: "product_id",
    },
  ],
  timestamps: {
    createdAt: "created_at",
  },
};

/**
 * UserProductPreferences mapping for ORM
 */
export const UserProductPreferencesMapping = {
  entity: "UserProductPreferences",
  table: "user_product_preferences",
  idField: "preference_id",
  columns: [
    {
      logical: "preference_id",
      physical: "preference_id",
      primaryKey: true,
      autoIncrement: true,
    },
    { logical: "user_id", physical: "user_id" },
    { logical: "default_view", physical: "default_view" },
    { logical: "auto_shuffle", physical: "auto_shuffle", nullable: true },
    { logical: "show_hints", physical: "show_hints", nullable: true },
    {
      logical: "inactivity_timeout",
      physical: "inactivity_timeout",
      nullable: true,
    },
    {
      logical: "cards_per_session",
      physical: "cards_per_session",
      nullable: true,
    },
  ],
  relations: [
    {
      name: "user",
      type: "manyToOne",
      sourceEntity: "UserProductPreferences",
      targetEntity: "User",
      sourceColumn: "user_id",
      targetColumn: "user_id",
    },
  ],
};
