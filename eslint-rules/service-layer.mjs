/**
 * plan/04-service-layer.md §11 asks for two of its acceptance criteria to be
 * "verified by a lint rule, not by reading":
 *
 *   - No service module exports a Drizzle row type
 *   - Every service function's first parameter is `session`
 *
 * Both are conventions that hold perfectly on day one and erode on day forty,
 * when the twentieth module is written by copying the nineteenth. A rule
 * catches that; a code review comment does not scale to twenty files.
 *
 * These are AST-only rules with no type information. That is a deliberate
 * limit: requiring typed linting would mean running typescript-eslint's
 * type-aware config over the whole project, which is slow enough that people
 * turn it off. Everything below is detectable syntactically.
 */

/** Files these rules police. Everything else is unaffected. */
const SERVICE_PATH = /[\\/]lib[\\/]server[\\/]services[\\/][^\\/]+\.ts$/;

/** Modules in that folder that are not services and have no session to take. */
const NOT_A_SERVICE = /[\\/](errors|pagination)\.ts$/;

function isServiceFile(filename) {
  return SERVICE_PATH.test(filename) && !NOT_A_SERVICE.test(filename);
}

/**
 * `export type X = InferSelectModel<typeof patients>` and
 * `export type X = typeof patients.$inferSelect` — the two spellings of a
 * Drizzle row type. Exporting either is what plan §2.1 forbids, because a row
 * type in a public signature is how an encrypted column reaches a component.
 */
const noExportedRowType = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Service modules must not export a Drizzle row type; return a DTO instead (plan/04 §2.1).",
    },
    schema: [],
    messages: {
      exported:
        "Do not export the Drizzle row type '{{name}}'. A row type in a public signature is how " +
        "an encrypted column reaches a Client Component (plan/04-service-layer.md §2.1). " +
        "Project into a DTO and export that.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isServiceFile(filename)) return {};

    /** Does this type annotation name a Drizzle row type? */
    function isRowType(node) {
      if (!node) return false;
      // InferSelectModel<...> / InferInsertModel<...>
      if (
        node.type === "TSTypeReference" &&
        node.typeName?.type === "Identifier" &&
        /^Infer(Select|Insert)Model$/.test(node.typeName.name)
      ) {
        return true;
      }
      // typeof table.$inferSelect / $inferInsert
      if (
        node.type === "TSTypeQuery" &&
        node.exprName?.type === "TSQualifiedName" &&
        /^\$infer(Select|Insert)$/.test(node.exprName.right?.name ?? "")
      ) {
        return true;
      }
      // (typeof table)["$inferSelect"] — the same thing, spelled as an
      // indexed access. Only the `$infer*` index counts: a bare
      // TSIndexedAccessType is far too broad and flags ordinary narrowing
      // like `Feedback["status"]`, which is a string union and not a row.
      if (
        node.type === "TSIndexedAccessType" &&
        node.indexType?.type === "TSLiteralType" &&
        /^\$infer(Select|Insert)$/.test(node.indexType.literal?.value ?? "")
      ) {
        return true;
      }
      return false;
    }

    return {
      "ExportNamedDeclaration > TSTypeAliasDeclaration"(node) {
        if (isRowType(node.typeAnnotation)) {
          context.report({ node, messageId: "exported", data: { name: node.id.name } });
        }
      },
      // `export type { PatientRow }` after a local declaration.
      ExportNamedDeclaration(node) {
        if (!node.exportKind || node.exportKind !== "type") return;
        for (const specifier of node.specifiers ?? []) {
          const name = specifier.local?.name ?? "";
          if (/Row$/.test(name)) {
            context.report({ node: specifier, messageId: "exported", data: { name } });
          }
        }
      },
    };
  },
};

/**
 * plan §2.2: "Every function takes `session` as its first argument,
 * non-optional, first position, every function including reads."
 *
 * The argument is the point: "forgetting the check is possible; forgetting the
 * argument is a compile error, and the argument is useless unless checked, so
 * review has one thing to look for." This rule makes the argument's absence a
 * lint error too, so the compile error never has to be the only line of
 * defence.
 *
 * Only exported functions are checked. A module-private helper that already
 * runs inside `withSession` has the scope applied by Postgres and does not
 * need to re-take it.
 */
const sessionFirstArgument = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Exported service functions must take `session` as their first parameter (plan/04 §2.2).",
    },
    schema: [],
    messages: {
      missing:
        "Exported service function '{{name}}' must take `session` as its first parameter " +
        "(plan/04-service-layer.md §2.2). Forgetting the check is possible; forgetting the " +
        "argument should not be.",
      optional:
        "`session` on '{{name}}' must not be optional. An authorisation decision with no subject " +
        "is not a decision.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!isServiceFile(filename)) return {};

    function check(node, name) {
      const [first] = node.params ?? [];
      if (!first) {
        context.report({ node, messageId: "missing", data: { name } });
        return;
      }
      const identifier =
        first.type === "Identifier"
          ? first
          : first.type === "AssignmentPattern" && first.left.type === "Identifier"
            ? first.left
            : null;

      if (!identifier || identifier.name !== "session") {
        context.report({ node, messageId: "missing", data: { name } });
        return;
      }
      if (identifier.optional || first.type === "AssignmentPattern") {
        context.report({ node, messageId: "optional", data: { name } });
      }
    }

    return {
      "ExportNamedDeclaration > FunctionDeclaration"(node) {
        check(node, node.id?.name ?? "(anonymous)");
      },
      "ExportNamedDeclaration > VariableDeclaration > VariableDeclarator"(node) {
        const init = node.init;
        if (!init) return;
        if (init.type !== "ArrowFunctionExpression" && init.type !== "FunctionExpression") return;
        check(init, node.id?.name ?? "(anonymous)");
      },
    };
  },
};

const serviceLayerPlugin = {
  rules: {
    "no-exported-row-type": noExportedRowType,
    "session-first-argument": sessionFirstArgument,
  },
};

export default serviceLayerPlugin;
