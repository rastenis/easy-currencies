import { _to, sleep, checkIfProvider, checkIfUserDefinedProvider } from "../../src/parts/utils";

const provider = {
  endpoint: { base: "b", single: "s" },
  key: "k",
  handler: () => ({}),
  errors: {},
  errorHandler: () => null
};

describe("sleep", () => {
  afterEach(() => jest.useRealTimers());

  it("resolves once the delay elapses", async () => {
    jest.useFakeTimers();
    const pending = sleep(1000);

    jest.advanceTimersByTime(1000);

    await expect(pending).resolves.toBeUndefined();
  });

  it("does not resolve early", async () => {
    jest.useFakeTimers();
    let done = false;
    sleep(1000).then(() => (done = true));

    jest.advanceTimersByTime(999);
    await Promise.resolve();

    expect(done).toBe(false);
  });
});

describe("_to", () => {
  it("returns [null, value] when the promise resolves", async () => {
    await expect(_to(Promise.resolve(42))).resolves.toEqual([null, 42]);
  });

  it("returns [error, null] when the promise rejects", async () => {
    const err = new Error("nope");
    await expect(_to(Promise.reject(err))).resolves.toEqual([err, null]);
  });

  it("treats a rejection with a falsy value as an error", async () => {
    await expect(_to(Promise.reject(undefined))).resolves.toEqual([undefined, null]);
  });
});

describe("provider type guards", () => {
  it("accepts a complete provider", () => {
    expect(checkIfProvider(provider)).toBe(true);
  });

  it("accepts a keyless provider", () => {
    const { key, ...keyless } = provider;

    expect(checkIfProvider(keyless)).toBe(true);
  });

  it("rejects null", () => {
    expect(checkIfProvider(null)).toBe(false);
    expect(checkIfUserDefinedProvider(null)).toBe(false);
  });

  it.each(["endpoint", "handler", "errors", "errorHandler"])(
    "rejects a provider missing %s",
    (field) => {
      const incomplete: any = { ...provider };
      delete incomplete[field];

      expect(checkIfProvider(incomplete)).toBe(false);
    }
  );

  it("accepts a named user-defined provider", () => {
    expect(checkIfUserDefinedProvider({ name: "X", provider })).toBe(true);
  });

  it("rejects one without a name", () => {
    expect(checkIfUserDefinedProvider({ provider })).toBe(false);
  });

  it("rejects one whose provider is malformed", () => {
    expect(checkIfUserDefinedProvider({ name: "X", provider: {} })).toBe(false);
  });

  // Fuzzing found these as raw TypeErrors escaping the config surface: `!==
  // undefined` let them through the guard, and they crashed dereferencing the
  // field further down instead of failing here.
  it("rejects a provider with a null endpoint", () => {
    expect(checkIfProvider({ ...provider, endpoint: null })).toBe(false);
  });

  it("rejects a name that is an object rather than a string", () => {
    expect(
      checkIfUserDefinedProvider({ name: Object.create(null), provider })
    ).toBe(false);
  });
});
