/**
 * Database-agnostic date functions
 * Provides date handling functionality that works across different database systems
 */

import { DateFunctions } from "../core/types";
import { DatabaseContext } from "../core/database-context";

/**
 * Abstract date function factory
 * Returns date expressions appropriate for the current database system
 */
export class DateExpressions {
  /**
   * Get database-specific date functions
   */
  private static getDateFunctions(): DateFunctions {
    return DatabaseContext.getDatabase().getDateFunctions();
  }

  /**
   * Get current date expression
   * @returns SQL expression for current date
   */
  static currentDate(): string {
    return this.getDateFunctions().currentDate();
  }

  /**
   * Get current date and time expression
   * @returns SQL expression for current date and time
   */
  static currentDateTime(): string {
    return this.getDateFunctions().currentDateTime();
  }

  /**
   * Get date difference expression
   * @param date1 First date expression
   * @param date2 Second date expression
   * @param unit Unit of difference (day, month, year)
   * @returns SQL expression for date difference
   */
  static dateDiff(
    date1: string | Date,
    date2: string | Date,
    unit: "day" | "month" | "year"
  ): string {
    const date1Expr =
      typeof date1 === "string" ? date1 : `'${date1.toISOString()}'`;
    const date2Expr =
      typeof date2 === "string" ? date2 : `'${date2.toISOString()}'`;

    return this.getDateFunctions().dateDiff(date1Expr, date2Expr, unit);
  }

  /**
   * Get date addition expression
   * @param date Base date expression
   * @param amount Amount to add
   * @param unit Unit to add (day, month, year)
   * @returns SQL expression for date addition
   */
  static dateAdd(
    date: string | Date,
    amount: number,
    unit: "day" | "month" | "year"
  ): string {
    const dateExpr =
      typeof date === "string" ? date : `'${date.toISOString()}'`;

    return this.getDateFunctions().dateAdd(dateExpr, amount, unit);
  }

  /**
   * Format a date as string
   * @param date Date expression
   * @param format Format string (implementation is database-specific)
   * @returns SQL expression for formatted date
   */
  static formatDate(date: string | Date, format: string): string {
    const dateExpr =
      typeof date === "string" ? date : `'${date.toISOString()}'`;

    return this.getDateFunctions().formatDate(dateExpr, format);
  }

  /**
   * Check if a date is valid
   * @param date Date expression
   * @returns SQL expression that returns 1 if valid, 0 if invalid
   */
  static isDateValid(date: string | Date): string {
    const dateExpr =
      typeof date === "string" ? date : `'${date.toISOString()}'`;

    return this.getDateFunctions().isDateValid(dateExpr);
  }

  /**
   * Get SQL expression for yesterday's date
   * @returns SQL expression for yesterday
   */
  static yesterday(): string {
    return this.dateAdd(this.currentDate(), -1, "day");
  }

  /**
   * Get SQL expression for tomorrow's date
   * @returns SQL expression for tomorrow
   */
  static tomorrow(): string {
    return this.dateAdd(this.currentDate(), 1, "day");
  }

  /**
   * Get SQL expression for the first day of the current month
   * @returns SQL expression for first day of month
   */
  static firstDayOfMonth(): string {
    // This is an approximation - specific implementations may vary by database
    return `SUBSTR(${this.currentDate()}, 1, 8) || '01'`;
  }

  /**
   * Get SQL expression for the last day of the current month
   * @returns SQL expression for last day of month
   */
  static lastDayOfMonth(): string {
    // Add 1 month to the first day of the current month, then subtract 1 day
    return this.dateAdd(
      this.dateAdd(this.firstDayOfMonth(), 1, "month"),
      -1,
      "day"
    );
  }

  /**
   * Get SQL expression for a date with time set to beginning of day (00:00:00)
   * @param date Date expression
   * @returns SQL expression for date at beginning of day
   */
  static startOfDay(date: string | Date): string {
    const dateExpr =
      typeof date === "string" ? date : `'${date.toISOString()}'`;

    // This is an approximation - specific implementations may vary by database
    return `SUBSTR(${dateExpr}, 1, 10) || ' 00:00:00'`;
  }

  /**
   * Get SQL expression for a date with time set to end of day (23:59:59)
   * @param date Date expression
   * @returns SQL expression for date at end of day
   */
  static endOfDay(date: string | Date): string {
    const dateExpr =
      typeof date === "string" ? date : `'${date.toISOString()}'`;

    // This is an approximation - specific implementations may vary by database
    return `SUBSTR(${dateExpr}, 1, 10) || ' 23:59:59'`;
  }
}
