// Applies pending migrations. The app also does this automatically on startup.
import { db } from "./client";

db();
console.log("Database is up to date.");
