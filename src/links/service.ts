import type { DatabaseClient, LinkCreateResult } from "../db.js";
import { generateShortCode } from "./code.js";
import { validateCreateLinkInput, type CreateLinkInput, type CreateLinkValidationErrorCode } from "./validation.js";

const MAX_GENERATED_CODE_ATTEMPTS = 5;

type CreateLinkOptions = {
  db: DatabaseClient;
  publicBaseUrl: string;
  input: CreateLinkInput;
  generateCode?: () => string;
};

type CreatedLink = {
  id: string;
  url: string;
  originalUrl: string;
  shortCode: string;
  shortUrl: string;
  isCustomAlias: boolean;
  expiresAt: Date | null;
  createdAt: Date;
};

export class LinkValidationError extends Error {
  constructor(
    public readonly code: CreateLinkValidationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LinkValidationError";
  }
}

export class LinkCodeCollisionError extends Error {
  constructor() {
    super("Short code is already in use.");
    this.name = "LinkCodeCollisionError";
  }
}

export async function createLink(options: CreateLinkOptions): Promise<CreatedLink> {
  const validation = validateCreateLinkInput(options.input);
  if (!validation.ok) {
    throw new LinkValidationError(validation.code, validation.message);
  }

  const { url, alias, expiresAt } = validation.value;
  const isCustomAlias = alias !== undefined;
  const attempts = isCustomAlias ? 1 : MAX_GENERATED_CODE_ATTEMPTS;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const shortCode = alias ?? (options.generateCode ?? generateShortCode)();

    try {
      const created = await options.db.link.create({
        data: {
          originalUrl: url,
          shortCode,
          isCustomAlias,
          expiresAt: expiresAt ?? null,
        },
      });

      return toCreatedLink(created, options.publicBaseUrl);
    } catch (error) {
      if (!isUniqueConstraintError(error) || (isCustomAlias || attempt === attempts - 1)) {
        if (isUniqueConstraintError(error)) {
          throw new LinkCodeCollisionError();
        }

        throw error;
      }
    }
  }

  throw new LinkCodeCollisionError();
}

function toCreatedLink(link: LinkCreateResult, publicBaseUrl: string): CreatedLink {
  return {
    id: link.id,
    url: link.originalUrl,
    originalUrl: link.originalUrl,
    shortCode: link.shortCode,
    shortUrl: `${publicBaseUrl.replace(/\/+$/, "")}/${link.shortCode}`,
    isCustomAlias: link.isCustomAlias,
    expiresAt: link.expiresAt,
    createdAt: link.createdAt,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
