/**
 * handlerSmoke.test.js
 *
 * Regression guard: Confirms that app.js correctly exports `handler` as a function.
 * This catches the Lambda "Runtime.HandlerNotFound" class of failure before deploy.
 *
 * We set AWS_EXECUTION_ENV before requiring app.js so it runs in Lambda mode
 * (skipping app.listen, which would conflict with the port used by other test files).
 */

describe("Lambda handler export smoke check", () => {
  it("should export handler as a function from app.js", () => {
    // Simulate Lambda environment so app.js skips app.listen()
    process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs20.x";

    // Clear module cache so app.js re-evaluates with the env var set
    jest.resetModules();
    const app = require("../app");

    expect(typeof app.handler).toBe("function");

    // Clean up — restore non-Lambda mode for any test that runs after
    delete process.env.AWS_EXECUTION_ENV;
  });
});
