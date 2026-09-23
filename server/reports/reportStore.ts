export type ReportType = "emergency" | "food" | "general";

export interface ReportNameFields {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}

// Display summary only. Authorization uses the stored reference before population.
export interface ReportUserSummary extends ReportNameFields {
  publicId: string;
}

export interface ReportRecord {
  publicId: string;
  description?: string | null;
  type?: string | null;
  status?: string | null;
  location?: { lat?: number | null; lng?: number | null } | null;
  media?: string[] | null;
  createdBy?: ReportUserSummary | null;
  assignedTo?: ReportUserSummary | null;
  createdByName?: string | null;
  assignedToName?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  // Retained MongoDB __v compatibility; not a new domain requirement.
  legacyVersion?: number | null;
}

export interface CreateReport {
  description: string;
  type: ReportType;
  location: { lat: number; lng: number };
  media?: string[];
  createdBy: string | null;
  createdByName: string | null;
}

export type ClaimReportOutcome =
  | { kind: "claimed"; report: ReportRecord }
  | { kind: "not-found" }
  | { kind: "not-new" };

export type ResolveReportOutcome =
  | { kind: "resolved"; report: ReportRecord }
  | { kind: "not-found" }
  | { kind: "not-assignee" };

export interface PersonalReportStats {
  total: number;
  resolved: number;
  inProgress: number;
}

export interface GlobalReportStats extends PersonalReportStats {
  new: number;
}

export interface ReportStore {
  create(input: CreateReport): Promise<ReportRecord>;
  listAll(): Promise<ReportRecord[]>;
  listAssignedTo(userId: string): Promise<ReportRecord[]>;
  claim(publicId: string, assignee: { publicId: string; name: string | null }): Promise<ClaimReportOutcome>;
  resolve(publicId: string, userId: string): Promise<ResolveReportOutcome>;
  getGlobalStats(): Promise<GlobalReportStats>;
  getAssignedStats(userId: string): Promise<PersonalReportStats>;
}
