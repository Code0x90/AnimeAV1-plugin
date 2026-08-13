/**
 * Copyright (c) 2014-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

var runtime = (function (exports) {
  "use strict";

  var Op = Object.prototype;
  var hasOwn = Op.hasOwnProperty;
  var defineProperty = Object.defineProperty || function (obj, key, desc) { obj[key] = desc.value; };
  var undefined; // More compressible than void 0.
  var $Symbol = typeof Symbol === "function" ? Symbol : {};
  var iteratorSymbol = $Symbol.iterator || "@@iterator";
  var asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator";
  var toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag";

  function define(obj, key, value) {
    Object.defineProperty(obj, key, {
      value: value,
      enumerable: true,
      configurable: true,
      writable: true
    });
    return obj[key];
  }
  try {
    // IE 8 has a broken Object.defineProperty that only works on DOM objects.
    define({}, "");
  } catch (err) {
    define = function(obj, key, value) {
      return obj[key] = value;
    };
  }

  function wrap(innerFn, outerFn, self, tryLocsList) {
    // If outerFn provided and outerFn.prototype is a Generator, then outerFn.prototype instanceof Generator.
    var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator;
    var generator = Object.create(protoGenerator.prototype);
    var context = new Context(tryLocsList || []);

    // The ._invoke method unifies the implementations of the .next,
    // .throw, and .return methods.
    defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) });

    return generator;
  }
  exports.wrap = wrap;

  // Try/catch helper to minimize deoptimizations. Returns a completion
  // record like context.tryEntries[i].completion. This interface could
  // have been (and was previously) designed to take a closure to be
  // invoked without arguments, but in all the cases we care about we
  // already have an existing method we want to call, so there's no need
  // to create a new function object. We can even get away with assuming
  // the method takes exactly one argument, since that happens to be true
  // in every case, so we don't have to touch the arguments object. The
  // only additional allocation required is the completion record, which
  // has a stable shape and so hopefully should be cheap to allocate.
  function tryCatch(fn, obj, arg) {
    try {
      return { type: "normal", arg: fn.call(obj, arg) };
    } catch (err) {
      return { type: "throw", arg: err };
    }
  }

  var GenStateSuspendedStart = "suspendedStart";
  var GenStateSuspendedYield = "suspendedYield";
  var GenStateExecuting = "executing";
  var GenStateCompleted = "completed";

  // Returning this object from the innerFn has the same effect as
  // breaking out of the dispatch switch statement.
  var ContinueSentinel = {};

  // Dummy constructor functions that we use as the .constructor and
  // .constructor.prototype properties for functions that return Generator
  // objects. For full spec compliance, you may wish to configure your
  // minifier not to mangle the names of these two functions.
  function Generator() {}
  function GeneratorFunction() {}
  function GeneratorFunctionPrototype() {}

  // This is a polyfill for %IteratorPrototype% for environments that
  // don't natively support it.
  var IteratorPrototype = {};
  define(IteratorPrototype, iteratorSymbol, function () {
    return this;
  });

  var getProto = Object.getPrototypeOf;
  var NativeIteratorPrototype = getProto && getProto(getProto(values([])));
  if (NativeIteratorPrototype &&
      NativeIteratorPrototype !== Op &&
      hasOwn.call(NativeIteratorPrototype, iteratorSymbol)) {
    // This environment has a native %IteratorPrototype%; use it instead
    // of the polyfill.
    IteratorPrototype = NativeIteratorPrototype;
  }

  var Gp = GeneratorFunctionPrototype.prototype =
    Generator.prototype = Object.create(IteratorPrototype);
  GeneratorFunction.prototype = GeneratorFunctionPrototype;
  defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: true });
  defineProperty(
    GeneratorFunctionPrototype,
    "constructor",
    { value: GeneratorFunction, configurable: true }
  );
  GeneratorFunction.displayName = define(
    GeneratorFunctionPrototype,
    toStringTagSymbol,
    "GeneratorFunction"
  );

  // Helper for defining the .next, .throw, and .return methods of the
  // Iterator interface in terms of a single ._invoke method.
  function defineIteratorMethods(prototype) {
    ["next", "throw", "return"].forEach(function(method) {
      define(prototype, method, function(arg) {
        return this._invoke(method, arg);
      });
    });
  }

  exports.isGeneratorFunction = function(genFun) {
    var ctor = typeof genFun === "function" && genFun.constructor;
    return ctor
      ? ctor === GeneratorFunction ||
        // For the native GeneratorFunction constructor, the best we can
        // do is to check its .name property.
        (ctor.displayName || ctor.name) === "GeneratorFunction"
      : false;
  };

  exports.mark = function(genFun) {
    if (Object.setPrototypeOf) {
      Object.setPrototypeOf(genFun, GeneratorFunctionPrototype);
    } else {
      genFun.__proto__ = GeneratorFunctionPrototype;
      define(genFun, toStringTagSymbol, "GeneratorFunction");
    }
    genFun.prototype = Object.create(Gp);
    return genFun;
  };

  // Within the body of any async function, `await x` is transformed to
  // `yield regeneratorRuntime.awrap(x)`, so that the runtime can test
  // `hasOwn.call(value, "__await")` to determine if the yielded value is
  // meant to be awaited.
  exports.awrap = function(arg) {
    return { __await: arg };
  };

  function AsyncIterator(generator, PromiseImpl) {
    function invoke(method, arg, resolve, reject) {
      var record = tryCatch(generator[method], generator, arg);
      if (record.type === "throw") {
        reject(record.arg);
      } else {
        var result = record.arg;
        var value = result.value;
        if (value &&
            typeof value === "object" &&
            hasOwn.call(value, "__await")) {
          return PromiseImpl.resolve(value.__await).then(function(value) {
            invoke("next", value, resolve, reject);
          }, function(err) {
            invoke("throw", err, resolve, reject);
          });
        }

        return PromiseImpl.resolve(value).then(function(unwrapped) {
          // When a yielded Promise is resolved, its final value becomes
          // the .value of the Promise<{value,done}> result for the
          // current iteration.
          result.value = unwrapped;
          resolve(result);
        }, function(error) {
          // If a rejected Promise was yielded, throw the rejection back
          // into the async generator function so it can be handled there.
          return invoke("throw", error, resolve, reject);
        });
      }
    }

    var previousPromise;

    function enqueue(method, arg) {
      function callInvokeWithMethodAndArg() {
        return new PromiseImpl(function(resolve, reject) {
          invoke(method, arg, resolve, reject);
        });
      }

      return previousPromise =
        // If enqueue has been called before, then we want to wait until
        // all previous Promises have been resolved before calling invoke,
        // so that results are always delivered in the correct order. If
        // enqueue has not been called before, then it is important to
        // call invoke immediately, without waiting on a callback to fire,
        // so that the async generator function has the opportunity to do
        // any necessary setup in a predictable way. This predictability
        // is why the Promise constructor synchronously invokes its
        // executor callback, and why async functions synchronously
        // execute code before the first await. Since we implement simple
        // async functions in terms of async generators, it is especially
        // important to get this right, even though it requires care.
        previousPromise ? previousPromise.then(
          callInvokeWithMethodAndArg,
          // Avoid propagating failures to Promises returned by later
          // invocations of the iterator.
          callInvokeWithMethodAndArg
        ) : callInvokeWithMethodAndArg();
    }

    // Define the unified helper method that is used to implement .next,
    // .throw, and .return (see defineIteratorMethods).
    defineProperty(this, "_invoke", { value: enqueue });
  }

  defineIteratorMethods(AsyncIterator.prototype);
  define(AsyncIterator.prototype, asyncIteratorSymbol, function () {
    return this;
  });
  exports.AsyncIterator = AsyncIterator;

  // Note that simple async functions are implemented on top of
  // AsyncIterator objects; they just return a Promise for the value of
  // the final result produced by the iterator.
  exports.async = function(innerFn, outerFn, self, tryLocsList, PromiseImpl) {
    if (PromiseImpl === void 0) PromiseImpl = Promise;

    var iter = new AsyncIterator(
      wrap(innerFn, outerFn, self, tryLocsList),
      PromiseImpl
    );

    return exports.isGeneratorFunction(outerFn)
      ? iter // If outerFn is a generator, return the full iterator.
      : iter.next().then(function(result) {
          return result.done ? result.value : iter.next();
        });
  };

  function makeInvokeMethod(innerFn, self, context) {
    var state = GenStateSuspendedStart;

    return function invoke(method, arg) {
      if (state === GenStateExecuting) {
        throw new Error("Generator is already running");
      }

      if (state === GenStateCompleted) {
        if (method === "throw") {
          throw arg;
        }

        // Be forgiving, per GeneratorResume behavior specified since ES2015:
        // ES2015 spec, step 3: https://262.ecma-international.org/6.0/#sec-generatorresume
        // Latest spec, step 2: https://tc39.es/ecma262/#sec-generatorresume
        return doneResult();
      }

      context.method = method;
      context.arg = arg;

      while (true) {
        var delegate = context.delegate;
        if (delegate) {
          var delegateResult = maybeInvokeDelegate(delegate, context);
          if (delegateResult) {
            if (delegateResult === ContinueSentinel) continue;
            return delegateResult;
          }
        }

        if (context.method === "next") {
          // Setting context._sent for legacy support of Babel's
          // function.sent implementation.
          context.sent = context._sent = context.arg;

        } else if (context.method === "throw") {
          if (state === GenStateSuspendedStart) {
            state = GenStateCompleted;
            throw context.arg;
          }

          context.dispatchException(context.arg);

        } else if (context.method === "return") {
          context.abrupt("return", context.arg);
        }

        state = GenStateExecuting;

        var record = tryCatch(innerFn, self, context);
        if (record.type === "normal") {
          // If an exception is thrown from innerFn, we leave state ===
          // GenStateExecuting and loop back for another invocation.
          state = context.done
            ? GenStateCompleted
            : GenStateSuspendedYield;

          if (record.arg === ContinueSentinel) {
            continue;
          }

          return {
            value: record.arg,
            done: context.done
          };

        } else if (record.type === "throw") {
          state = GenStateCompleted;
          // Dispatch the exception by looping back around to the
          // context.dispatchException(context.arg) call above.
          context.method = "throw";
          context.arg = record.arg;
        }
      }
    };
  }

  // Call delegate.iterator[context.method](context.arg) and handle the
  // result, either by returning a { value, done } result from the
  // delegate iterator, or by modifying context.method and context.arg,
  // setting context.delegate to null, and returning the ContinueSentinel.
  function maybeInvokeDelegate(delegate, context) {
    var methodName = context.method;
    var method = delegate.iterator[methodName];
    if (method === undefined) {
      // A .throw or .return when the delegate iterator has no .throw
      // method, or a missing .next method, always terminate the
      // yield* loop.
      context.delegate = null;

      // Note: ["return"] must be used for ES3 parsing compatibility.
      if (methodName === "throw" && delegate.iterator["return"]) {
        // If the delegate iterator has a return method, give it a
        // chance to clean up.
        context.method = "return";
        context.arg = undefined;
        maybeInvokeDelegate(delegate, context);

        if (context.method === "throw") {
          // If maybeInvokeDelegate(context) changed context.method from
          // "return" to "throw", let that override the TypeError below.
          return ContinueSentinel;
        }
      }
      if (methodName !== "return") {
        context.method = "throw";
        context.arg = new TypeError(
          "The iterator does not provide a '" + methodName + "' method");
      }

      return ContinueSentinel;
    }

    var record = tryCatch(method, delegate.iterator, context.arg);

    if (record.type === "throw") {
      context.method = "throw";
      context.arg = record.arg;
      context.delegate = null;
      return ContinueSentinel;
    }

    var info = record.arg;

    if (! info) {
      context.method = "throw";
      context.arg = new TypeError("iterator result is not an object");
      context.delegate = null;
      return ContinueSentinel;
    }

    if (info.done) {
      // Assign the result of the finished delegate to the temporary
      // variable specified by delegate.resultName (see delegateYield).
      context[delegate.resultName] = info.value;

      // Resume execution at the desired location (see delegateYield).
      context.next = delegate.nextLoc;

      // If context.method was "throw" but the delegate handled the
      // exception, let the outer generator proceed normally. If
      // context.method was "next", forget context.arg since it has been
      // "consumed" by the delegate iterator. If context.method was
      // "return", allow the original .return call to continue in the
      // outer generator.
      if (context.method !== "return") {
        context.method = "next";
        context.arg = undefined;
      }

    } else {
      // Re-yield the result returned by the delegate method.
      return info;
    }

    // The delegate iterator is finished, so forget it and continue with
    // the outer generator.
    context.delegate = null;
    return ContinueSentinel;
  }

  // Define Generator.prototype.{next,throw,return} in terms of the
  // unified ._invoke helper method.
  defineIteratorMethods(Gp);

  define(Gp, toStringTagSymbol, "Generator");

  // A Generator should always return itself as the iterator object when the
  // @@iterator function is called on it. Some browsers' implementations of the
  // iterator prototype chain incorrectly implement this, causing the Generator
  // object to not be returned from this call. This ensures that doesn't happen.
  // See https://github.com/facebook/regenerator/issues/274 for more details.
  define(Gp, iteratorSymbol, function() {
    return this;
  });

  define(Gp, "toString", function() {
    return "[object Generator]";
  });

  function pushTryEntry(locs) {
    var entry = { tryLoc: locs[0] };

    if (1 in locs) {
      entry.catchLoc = locs[1];
    }

    if (2 in locs) {
      entry.finallyLoc = locs[2];
      entry.afterLoc = locs[3];
    }

    this.tryEntries.push(entry);
  }

  function resetTryEntry(entry) {
    var record = entry.completion || {};
    record.type = "normal";
    delete record.arg;
    entry.completion = record;
  }

  function Context(tryLocsList) {
    // The root entry object (effectively a try statement without a catch
    // or a finally block) gives us a place to store values thrown from
    // locations where there is no enclosing try statement.
    this.tryEntries = [{ tryLoc: "root" }];
    tryLocsList.forEach(pushTryEntry, this);
    this.reset(true);
  }

  exports.keys = function(val) {
    var object = Object(val);
    var keys = [];
    for (var key in object) {
      keys.push(key);
    }
    keys.reverse();

    // Rather than returning an object with a next method, we keep
    // things simple and return the next function itself.
    return function next() {
      while (keys.length) {
        var key = keys.pop();
        if (key in object) {
          next.value = key;
          next.done = false;
          return next;
        }
      }

      // To avoid creating an additional object, we just hang the .value
      // and .done properties off the next function object itself. This
      // also ensures that the minifier will not anonymize the function.
      next.done = true;
      return next;
    };
  };

  function values(iterable) {
    if (iterable != null) {
      var iteratorMethod = iterable[iteratorSymbol];
      if (iteratorMethod) {
        return iteratorMethod.call(iterable);
      }

      if (typeof iterable.next === "function") {
        return iterable;
      }

      if (!isNaN(iterable.length)) {
        var i = -1, next = function next() {
          while (++i < iterable.length) {
            if (hasOwn.call(iterable, i)) {
              next.value = iterable[i];
              next.done = false;
              return next;
            }
          }

          next.value = undefined;
          next.done = true;

          return next;
        };

        return next.next = next;
      }
    }

    throw new TypeError(typeof iterable + " is not iterable");
  }
  exports.values = values;

  function doneResult() {
    return { value: undefined, done: true };
  }

  Context.prototype = {
    constructor: Context,

    reset: function(skipTempReset) {
      this.prev = 0;
      this.next = 0;
      // Resetting context._sent for legacy support of Babel's
      // function.sent implementation.
      this.sent = this._sent = undefined;
      this.done = false;
      this.delegate = null;

      this.method = "next";
      this.arg = undefined;

      this.tryEntries.forEach(resetTryEntry);

      if (!skipTempReset) {
        for (var name in this) {
          // Not sure about the optimal order of these conditions:
          if (name.charAt(0) === "t" &&
              hasOwn.call(this, name) &&
              !isNaN(+name.slice(1))) {
            this[name] = undefined;
          }
        }
      }
    },

    stop: function() {
      this.done = true;

      var rootEntry = this.tryEntries[0];
      var rootRecord = rootEntry.completion;
      if (rootRecord.type === "throw") {
        throw rootRecord.arg;
      }

      return this.rval;
    },

    dispatchException: function(exception) {
      if (this.done) {
        throw exception;
      }

      var context = this;
      function handle(loc, caught) {
        record.type = "throw";
        record.arg = exception;
        context.next = loc;

        if (caught) {
          // If the dispatched exception was caught by a catch block,
          // then let that catch block handle the exception normally.
          context.method = "next";
          context.arg = undefined;
        }

        return !! caught;
      }

      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        var record = entry.completion;

        if (entry.tryLoc === "root") {
          // Exception thrown outside of any try block that could handle
          // it, so set the completion value of the entire function to
          // throw the exception.
          return handle("end");
        }

        if (entry.tryLoc <= this.prev) {
          var hasCatch = hasOwn.call(entry, "catchLoc");
          var hasFinally = hasOwn.call(entry, "finallyLoc");

          if (hasCatch && hasFinally) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            } else if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }

          } else if (hasCatch) {
            if (this.prev < entry.catchLoc) {
              return handle(entry.catchLoc, true);
            }

          } else if (hasFinally) {
            if (this.prev < entry.finallyLoc) {
              return handle(entry.finallyLoc);
            }

          } else {
            throw new Error("try statement without catch or finally");
          }
        }
      }
    },

    abrupt: function(type, arg) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc <= this.prev &&
            hasOwn.call(entry, "finallyLoc") &&
            this.prev < entry.finallyLoc) {
          var finallyEntry = entry;
          break;
        }
      }

      if (finallyEntry &&
          (type === "break" ||
           type === "continue") &&
          finallyEntry.tryLoc <= arg &&
          arg <= finallyEntry.finallyLoc) {
        // Ignore the finally entry if control is not jumping to a
        // location outside the try/catch block.
        finallyEntry = null;
      }

      var record = finallyEntry ? finallyEntry.completion : {};
      record.type = type;
      record.arg = arg;

      if (finallyEntry) {
        this.method = "next";
        this.next = finallyEntry.finallyLoc;
        return ContinueSentinel;
      }

      return this.complete(record);
    },

    complete: function(record, afterLoc) {
      if (record.type === "throw") {
        throw record.arg;
      }

      if (record.type === "break" ||
          record.type === "continue") {
        this.next = record.arg;
      } else if (record.type === "return") {
        this.rval = this.arg = record.arg;
        this.method = "return";
        this.next = "end";
      } else if (record.type === "normal" && afterLoc) {
        this.next = afterLoc;
      }

      return ContinueSentinel;
    },

    finish: function(finallyLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.finallyLoc === finallyLoc) {
          this.complete(entry.completion, entry.afterLoc);
          resetTryEntry(entry);
          return ContinueSentinel;
        }
      }
    },

    "catch": function(tryLoc) {
      for (var i = this.tryEntries.length - 1; i >= 0; --i) {
        var entry = this.tryEntries[i];
        if (entry.tryLoc === tryLoc) {
          var record = entry.completion;
          if (record.type === "throw") {
            var thrown = record.arg;
            resetTryEntry(entry);
          }
          return thrown;
        }
      }

      // The context.catch method must only be called with a location
      // argument that corresponds to a known catch block.
      throw new Error("illegal catch attempt");
    },

    delegateYield: function(iterable, resultName, nextLoc) {
      this.delegate = {
        iterator: values(iterable),
        resultName: resultName,
        nextLoc: nextLoc
      };

      if (this.method === "next") {
        // Deliberately forget the last sent value so that we don't
        // accidentally pass it on to the delegate.
        this.arg = undefined;
      }

      return ContinueSentinel;
    }
  };

  // Regardless of whether this script is executing as a CommonJS module
  // or not, return the runtime object so that we can declare the variable
  // regeneratorRuntime in the outer scope, which allows this module to be
  // injected easily by `bin/regenerator --include-runtime script.js`.
  return exports;

}(
  // If this script is executing as a CommonJS module, use module.exports
  // as the regeneratorRuntime namespace. Otherwise create a new empty
  // object. Either way, the resulting object will be used to initialize
  // the regeneratorRuntime variable at the top of this file.
  typeof module === "object" ? module.exports : {}
));

try {
  regeneratorRuntime = runtime;
} catch (accidentalStrictMode) {
  // This module should not be running in strict mode, so the above
  // assignment should always work unless something is misconfigured. Just
  // in case runtime.js accidentally runs in strict mode, in modern engines
  // we can explicitly access globalThis. In older engines we can escape
  // strict mode using a global Function call. This could conceivably fail
  // if a Content Security Policy forbids using Function, but in that case
  // the proper solution is to fix the accidental strict mode problem. If
  // you've misconfigured your bundler to force strict mode and applied a
  // CSP to forbid Function, and you're not willing to fix either of those
  // problems, please detail your unique predicament in a GitHub issue.
  if (typeof globalThis === "object") {
    globalThis.regeneratorRuntime = runtime;
  } else {
    Function("r", "regeneratorRuntime = r")(runtime);
  }
}

function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i.return) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t.return || t.return(); } finally { if (u) throw o; } } }; }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
var __defProp = Object.defineProperty;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = function __defNormalProp(obj, key, value) {
  return key in obj ? __defProp(obj, key, {
    enumerable: true,
    configurable: true,
    writable: true,
    value
  }) : obj[key] = value;
};
var __spreadValues = function __spreadValues(a, b) {
  for (var prop in b || (b = {})) if (__hasOwnProp.call(b, prop)) __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols) {
    var _iterator = _createForOfIteratorHelper(__getOwnPropSymbols(b)),
      _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done;) {
        var prop = _step.value;
        if (__propIsEnum.call(b, prop)) __defNormalProp(a, prop, b[prop]);
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
  }
  return a;
};

// src/animeav1/index.js
var ANIMEAV1_BASE = "https://animeav1.com";
var TMDB_API_KEY = "56db0ec297530920213e1503706b81ff";
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var SOURCE_EXTRACTORS = {};
function getTMDBInfo(_x, _x2) {
  return _getTMDBInfo.apply(this, arguments);
}
function _getTMDBInfo() {
  _getTMDBInfo = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3(tmdbId, type) {
    var path, url, data, title, dateStr, year, originCountries, genreIds, isAnimation;
    return _regenerator().w(function (_context3) {
      while (1) switch (_context3.n) {
        case 0:
          path = type === "movie" ? "movie" : "tv";
          url = `https://api.themoviedb.org/3/${path}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
          _context3.n = 1;
          return fetch(url, {
            headers: {
              "User-Agent": UA
            }
          }).then(function (r) {
            return r.json();
          });
        case 1:
          data = _context3.v;
          if (!(!data || data.success === false)) {
            _context3.n = 2;
            break;
          }
          return _context3.a(2, null);
        case 2:
          title = data.title || data.name || data.original_title || data.original_name;
          dateStr = data.release_date || data.first_air_date;
          year = dateStr ? new Date(dateStr).getFullYear() : void 0;
          if (title) {
            _context3.n = 3;
            break;
          }
          return _context3.a(2, null);
        case 3:
          originCountries = type === "movie" ? (data.production_countries || []).map(function (c) {
            return c.iso_3166_1;
          }) : data.origin_country || [];
          genreIds = (data.genres || []).map(function (g) {
            return g.id;
          });
          isAnimation = genreIds.includes(16);
          return _context3.a(2, {
            title,
            year,
            originCountries,
            isAnimation
          });
      }
    }, _callee3);
  }));
  return _getTMDBInfo.apply(this, arguments);
}
var ASIAN_COUNTRIES = ["JP", "CN", "KR", "TW", "HK"];
function looksLikeAsianOrigin(originCountries) {
  if (!Array.isArray(originCountries) || originCountries.length === 0) return true;
  return originCountries.some(function (c) {
    return ASIAN_COUNTRIES.includes(c);
  });
}
function looksLikeAnime(info) {
  if (!looksLikeAsianOrigin(info.originCountries)) return false;
  if (info.isAnimation === false) return false;
  return true;
}
function getSeasonYear(_x3, _x4) {
  return _getSeasonYear.apply(this, arguments);
}
function _getSeasonYear() {
  _getSeasonYear = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4(tmdbId, seasonNum) {
    var url, data, airDate, year, _t3;
    return _regenerator().w(function (_context4) {
      while (1) switch (_context4.p = _context4.n) {
        case 0:
          _context4.p = 0;
          url = `https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=en-US`;
          _context4.n = 1;
          return fetch(url, {
            headers: {
              "User-Agent": UA
            }
          }).then(function (r) {
            if (!r.ok) throw Error(`HTTP error! Status: ${r.status}`);
            return r.json();
          });
        case 1:
          data = _context4.v;
          airDate = data == null ? void 0 : data.air_date;
          year = airDate ? new Date(airDate).getFullYear() : void 0;
          console.log(`[TMDB] Temporada ${seasonNum}: air_date="${airDate}" -> year=${year}`);
          return _context4.a(2, year);
        case 2:
          _context4.p = 2;
          _t3 = _context4.v;
          console.warn(`[TMDB] getSeasonYear fall\xF3 (temporada ${seasonNum}): ${_t3.message}`);
          return _context4.a(2, void 0);
      }
    }, _callee4, null, [[0, 2]]);
  }));
  return _getSeasonYear.apply(this, arguments);
}
var ANILIST_SEASON_SUFFIX_RE = /\s+(?:\d+(?:st|nd|rd|th)\s+season|season\s+\d+(?:\s+part\s+\d+)?|part\s+\d+)\s*$/i;
function anilistBaseTitle(romaji) {
  return romaji.replace(ANILIST_SEASON_SUFFIX_RE, "").trim();
}
function getAniListInfo(_x5, _x6) {
  return _getAniListInfo.apply(this, arguments);
}
function _getAniListInfo() {
  _getAniListInfo = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5(title, seasonNum) {
    var _a, _b, _c, query, resp, json, results, anchor, baseRomaji, sameSeries, withDate, target, _t4;
    return _regenerator().w(function (_context5) {
      while (1) switch (_context5.p = _context5.n) {
        case 0:
          _context5.p = 0;
          query = `query ($search: String) {
      Page(page: 1, perPage: 15) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          title { romaji english }
          seasonYear
          startDate { year month day }
        }
      }
    }`;
          _context5.n = 1;
          return fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            body: JSON.stringify({
              query,
              variables: {
                search: title
              }
            })
          });
        case 1:
          resp = _context5.v;
          if (resp.ok) {
            _context5.n = 2;
            break;
          }
          throw Error(`HTTP error! Status: ${resp.status}`);
        case 2:
          _context5.n = 3;
          return resp.json();
        case 3:
          json = _context5.v;
          results = (_b = (_a = json == null ? void 0 : json.data) == null ? void 0 : _a.Page) == null ? void 0 : _b.media;
          if (!(!Array.isArray(results) || results.length === 0)) {
            _context5.n = 4;
            break;
          }
          console.warn(`[AniList] Sin resultados para "${title}"`);
          return _context5.a(2, void 0);
        case 4:
          anchor = results[0];
          baseRomaji = anilistBaseTitle(((_c = anchor.title) == null ? void 0 : _c.romaji) || "");
          if (baseRomaji) {
            _context5.n = 5;
            break;
          }
          return _context5.a(2, void 0);
        case 5:
          sameSeries = results.filter(function (m) {
            var _a2;
            return anilistBaseTitle(((_a2 = m.title) == null ? void 0 : _a2.romaji) || "").toLowerCase() === baseRomaji.toLowerCase();
          });
          withDate = sameSeries.map(function (m) {
            var _a2, _b2;
            var sd = m.startDate;
            var year = (_a2 = m.seasonYear) != null ? _a2 : sd == null ? void 0 : sd.year;
            if (!year) return null;
            var sortKey = (sd == null ? void 0 : sd.year) ? `${sd.year}-${String(sd.month || 1).padStart(2, "0")}-${String(sd.day || 1).padStart(2, "0")}` : `${year}-01-01`;
            return {
              title: (_b2 = m.title) == null ? void 0 : _b2.romaji,
              year,
              sortKey
            };
          }).filter(Boolean).sort(function (a, b) {
            return a.sortKey.localeCompare(b.sortKey);
          });
          console.log(`[AniList] "${baseRomaji}" \u2014 ${withDate.length} temporada(s) encontradas: ${withDate.map(function (w) {
            return `${w.title}(${w.year})`;
          }).join(", ")}`);
          target = withDate[seasonNum - 1];
          if (target) {
            _context5.n = 6;
            break;
          }
          console.warn(`[AniList] No hay entrada para temporada ${seasonNum} (solo ${withDate.length} encontradas)`);
          return _context5.a(2, void 0);
        case 6:
          console.log(`[AniList] Temporada ${seasonNum} -> "${target.title}" year=${target.year}`);
          return _context5.a(2, {
            year: target.year,
            romajiTitle: target.title
          });
        case 7:
          _context5.p = 7;
          _t4 = _context5.v;
          console.warn(`[AniList] getAniListInfo fall\xF3: ${_t4.message}`);
          return _context5.a(2, void 0);
      }
    }, _callee5, null, [[0, 7]]);
  }));
  return _getAniListInfo.apply(this, arguments);
}
function sanitizeQuery(query) {
  return query.replace(/[-–—]/g, " ").replace(/['"  \u2018\u2019\u201c\u201d`´]/g, " ").replace(/[^a-zA-Z0-9áéíóúüñÁÉÍÓÚÜÑ\s]/g, " ").replace(/\s+/g, " ").trim();
}
function buildSearchURL(query, page, year) {
  var params = new URLSearchParams();
  if (query) params.set("search", query);
  if (year) {
    params.set("minYear", year);
    params.set("maxYear", year);
  }
  if (page) params.set("page", page);
  return `${ANIMEAV1_BASE}/catalogo?${params.toString()}`;
}
function searchAnimesBySpecificURL(_x7) {
  return _searchAnimesBySpecificURL.apply(this, arguments);
}
function _searchAnimesBySpecificURL() {
  _searchAnimesBySpecificURL = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6(url) {
    var html, objBlockRegex, media, m;
    return _regenerator().w(function (_context6) {
      while (1) switch (_context6.n) {
        case 0:
          _context6.n = 1;
          return fetch(url, {
            headers: {
              "User-Agent": UA
            }
          }).then(function (resp) {
            if (!resp.ok) throw Error(`HTTP error! Status: ${resp.status}`);
            return resp.text();
          });
        case 1:
          html = _context6.v;
          objBlockRegex = /\{\s*id:\s*"([^"]+)",\s*title:\s*"((?:[^"\\]|\\.)*)",\s*synopsis:\s*"((?:[^"\\]|\\.)*)",\s*categoryId:\s*\d+,\s*slug:\s*"([^"]+)"/g;
          media = [];
          while ((m = objBlockRegex.exec(html)) !== null) {
            media.push({
              id: m[1],
              title: m[2].replace(/\\"/g, '"').replace(/\\n/g, "\n"),
              synopsis: m[3].replace(/\\"/g, '"').replace(/\\n/g, "\n"),
              slug: m[4]
            });
          }
          return _context6.a(2, {
            media
          });
      }
    }, _callee6);
  }));
  return _searchAnimesBySpecificURL.apply(this, arguments);
}
function searchAnimeAV1(_x8, _x9) {
  return _searchAnimeAV.apply(this, arguments);
}
function _searchAnimeAV() {
  _searchAnimeAV = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee8(query, year) {
    var runSearch, sanitized, base, firstWords, _t5, _t6, _t7;
    return _regenerator().w(function (_context8) {
      while (1) switch (_context8.p = _context8.n) {
        case 0:
          runSearch = /*#__PURE__*/function () {
            var _ref3 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7(searchQuery) {
              var _a, searchURL, data;
              return _regenerator().w(function (_context7) {
                while (1) switch (_context7.n) {
                  case 0:
                    searchURL = buildSearchURL(searchQuery, void 0, year);
                    console.log(`[AnimeAV1] Buscando: ${searchURL}`);
                    _context7.n = 1;
                    return searchAnimesBySpecificURL(searchURL);
                  case 1:
                    data = _context7.v;
                    if ((_a = data == null ? void 0 : data.media) == null ? void 0 : _a.length) {
                      _context7.n = 2;
                      break;
                    }
                    throw Error("No search results!");
                  case 2:
                    return _context7.a(2, data.media);
                }
              }, _callee7);
            }));
            return function runSearch(_x17) {
              return _ref3.apply(this, arguments);
            };
          }();
          _context8.p = 1;
          _context8.n = 2;
          return runSearch(query);
        case 2:
          return _context8.a(2, _context8.v);
        case 3:
          _context8.p = 3;
          _t5 = _context8.v;
          if (!(_t5.message !== "No search results!")) {
            _context8.n = 4;
            break;
          }
          throw _t5;
        case 4:
          sanitized = sanitizeQuery(query);
          if (!(sanitized && sanitized !== query)) {
            _context8.n = 8;
            break;
          }
          _context8.p = 5;
          _context8.n = 6;
          return runSearch(sanitized);
        case 6:
          return _context8.a(2, _context8.v);
        case 7:
          _context8.p = 7;
          _t6 = _context8.v;
          if (!(_t6.message !== "No search results!")) {
            _context8.n = 8;
            break;
          }
          throw _t6;
        case 8:
          base = sanitized || query;
          firstWords = base.split(" ").filter(Boolean).slice(0, 3).join(" ");
          if (!(firstWords && firstWords !== base)) {
            _context8.n = 12;
            break;
          }
          _context8.p = 9;
          _context8.n = 10;
          return runSearch(firstWords);
        case 10:
          return _context8.a(2, _context8.v);
        case 11:
          _context8.p = 11;
          _t7 = _context8.v;
          if (!(_t7.message !== "No search results!")) {
            _context8.n = 12;
            break;
          }
          throw _t7;
        case 12:
          throw Error("No search results!");
        case 13:
          return _context8.a(2);
      }
    }, _callee8, null, [[9, 11], [5, 7], [1, 3]]);
  }));
  return _searchAnimeAV.apply(this, arguments);
}
var HIGHER_SEASON_PATTERNS = [/\b2nd\s+season\b/i, /\b3rd\s+season\b/i, /\b4th\s+season\b/i, /\bseason\s+[2-9]\b/i, /\bpart\s+[2-9]\b/i, /\b2\w*\s+temporada\b/i, /\s+[2-9]$/];
function pickBestMatch(candidates, searchTerm, seasonNum) {
  var norm = function norm(s) {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  };
  var pool = candidates;
  if (seasonNum === 1) {
    var filtered = candidates.filter(function (c) {
      return !HIGHER_SEASON_PATTERNS.some(function (p) {
        return p.test(c.title);
      });
    });
    if (filtered.length > 0) pool = filtered;
  }
  var target = norm(searchTerm);
  var best = pool.find(function (c) {
    return norm(c.title) === target;
  });
  if (best) return best;
  best = pool.find(function (c) {
    return norm(c.title).includes(target) || target.includes(norm(c.title));
  });
  if (best) return best;
  return pool[0];
}
function getEpisodeServers(_x0, _x1) {
  return _getEpisodeServers.apply(this, arguments);
}
function _getEpisodeServers() {
  _getEpisodeServers = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee9(slug, epNumber) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, ep, pageUrl, matchesSupportedSource2, resolveField2, resolveServer2, extractServers2, matchesSupportedSource, resolveField, resolveServer, extractServers, jsonUrl, resp, root, nodes, dataArray, _iterator3, _step3, node, hasEmbeds, episodeObj, embedsIndex, embeds, servers, subIndex, dubIndex, downloadsIndex, downloads, dlSubIndex, dlDubIndex, html, metadataJSON, serversObj, serversObjDUB, downloadObj, downloadObjDUB, raw, _servers, _t8, _t9, _t0;
    return _regenerator().w(function (_context9) {
      while (1) switch (_context9.p = _context9.n) {
        case 0:
          ep = epNumber !== void 0 && epNumber !== null ? Number(epNumber) : 1;
          pageUrl = `${ANIMEAV1_BASE}/media/${slug}/${ep}`;
          console.log(`[AnimeAV1] GetEpisodeServers: ${pageUrl}`);
          _context9.p = 1;
          matchesSupportedSource2 = function matchesSupportedSource2(name) {
            return Object.keys(SOURCE_EXTRACTORS).some(function (key) {
              return name.includes(key);
            });
          }, resolveField2 = function resolveField2(value) {
            if (typeof value === "number" && dataArray[value] !== void 0) {
              var resolved = dataArray[value];
              if (typeof resolved === "string") return resolved;
            }
            if (typeof value === "string") return value;
            return null;
          }, resolveServer2 = function resolveServer2(entry) {
            try {
              var obj = typeof entry === "number" ? dataArray[entry] : entry;
              if (!obj || typeof obj !== "object") return null;
              var serverName = resolveField2(obj.server);
              var url = resolveField2(obj.url);
              if (typeof serverName !== "string" || typeof url !== "string") return null;
              return {
                name: serverName,
                url
              };
            } catch (_) {
              return null;
            }
          }, extractServers2 = function extractServers2(listOrIndex, dub) {
            var list = typeof listOrIndex === "number" ? dataArray[listOrIndex] : listOrIndex;
            if (!Array.isArray(list)) return;
            var _iterator2 = _createForOfIteratorHelper(list),
              _step2;
            try {
              for (_iterator2.s(); !(_step2 = _iterator2.n()).done;) {
                var entry = _step2.value;
                var server = resolveServer2(entry);
                if (!server || !server.url.startsWith("http")) continue;
                if (!matchesSupportedSource2(server.name)) continue;
                servers.push({
                  name: server.name,
                  url: server.url,
                  dub
                });
                console.log(`[AnimeAV1] Servidor detectado: ${server.name} (${dub ? "DUB" : "SUB"})`);
              }
            } catch (err) {
              _iterator2.e(err);
            } finally {
              _iterator2.f();
            }
          };
          matchesSupportedSource = matchesSupportedSource2, resolveField = resolveField2, resolveServer = resolveServer2, extractServers = extractServers2;
          jsonUrl = `${pageUrl}/__data.json`;
          _context9.n = 2;
          return fetch(jsonUrl, {
            headers: {
              "User-Agent": UA,
              "Referer": ANIMEAV1_BASE + "/"
            }
          });
        case 2:
          resp = _context9.v;
          if (resp.ok) {
            _context9.n = 3;
            break;
          }
          throw Error(`HTTP error! Status: ${resp.status}`);
        case 3:
          _context9.n = 4;
          return resp.json();
        case 4:
          root = _context9.v;
          nodes = root == null ? void 0 : root.nodes;
          if (Array.isArray(nodes)) {
            _context9.n = 5;
            break;
          }
          throw Error("No nodes in __data.json");
        case 5:
          dataArray = null;
          _iterator3 = _createForOfIteratorHelper(nodes);
          _context9.p = 6;
          _iterator3.s();
        case 7:
          if ((_step3 = _iterator3.n()).done) {
            _context9.n = 9;
            break;
          }
          node = _step3.value;
          if (!((node == null ? void 0 : node.data) && Array.isArray(node.data))) {
            _context9.n = 8;
            break;
          }
          hasEmbeds = node.data.some(function (d) {
            return d && typeof d === "object" && "embeds" in d;
          });
          if (!hasEmbeds) {
            _context9.n = 8;
            break;
          }
          dataArray = node.data;
          return _context9.a(3, 9);
        case 8:
          _context9.n = 7;
          break;
        case 9:
          _context9.n = 11;
          break;
        case 10:
          _context9.p = 10;
          _t8 = _context9.v;
          _iterator3.e(_t8);
        case 11:
          _context9.p = 11;
          _iterator3.f();
          return _context9.f(11);
        case 12:
          if (dataArray) {
            _context9.n = 13;
            break;
          }
          throw Error("No data array with embeds found");
        case 13:
          episodeObj = dataArray.find(function (d) {
            return d && typeof d === "object" && "embeds" in d;
          });
          if (episodeObj) {
            _context9.n = 14;
            break;
          }
          throw Error("No episode object found");
        case 14:
          embedsIndex = episodeObj.embeds;
          embeds = dataArray[embedsIndex];
          if (!(!embeds || typeof embeds !== "object")) {
            _context9.n = 15;
            break;
          }
          throw Error("No embeds object");
        case 15:
          servers = [];
          subIndex = (_a = embeds.SUB) != null ? _a : embeds.sub;
          dubIndex = (_b = embeds.DUB) != null ? _b : embeds.dub;
          if (subIndex !== void 0) extractServers2(subIndex, false);
          if (dubIndex !== void 0) extractServers2(dubIndex, true);
          downloadsIndex = episodeObj.downloads;
          if (downloadsIndex !== void 0) {
            downloads = dataArray[downloadsIndex];
            if (downloads && typeof downloads === "object") {
              dlSubIndex = (_c = downloads.SUB) != null ? _c : downloads.sub;
              dlDubIndex = (_d = downloads.DUB) != null ? _d : downloads.dub;
              if (dlSubIndex !== void 0) extractServers2(dlSubIndex, false);
              if (dlDubIndex !== void 0) extractServers2(dlDubIndex, true);
            }
          }
          if (!(servers.length > 0)) {
            _context9.n = 16;
            break;
          }
          console.log(`[AnimeAV1] __data.json OK: ${servers.length} servidores soportados`);
          return _context9.a(2, servers);
        case 16:
          throw Error("__data.json returned 0 servidores soportados, falling back");
        case 17:
          _context9.p = 17;
          _t9 = _context9.v;
          console.warn(`[AnimeAV1] __data.json fall\xF3 (${_t9.message}), probando HTML scraping`);
        case 18:
          _context9.p = 18;
          _context9.n = 19;
          return fetch(pageUrl, {
            headers: {
              "User-Agent": UA
            }
          }).then(function (resp) {
            if (!resp.ok) throw Error(`HTTP error! Status: ${resp.status}`);
            return resp.text();
          });
        case 19:
          html = _context9.v;
          metadataJSON = (_e = html.match(/kit\.start\(app,\s*element,\s*\{[\s\S]*/)) == null ? void 0 : _e[0];
          serversObj = (_f = metadataJSON == null ? void 0 : metadataJSON.match(/embeds:\s?.*?SUB:\s?(\[.*?\])/)) == null ? void 0 : _f[1];
          serversObjDUB = (_g = metadataJSON == null ? void 0 : metadataJSON.match(/embeds:\s?.*?DUB:\s?(\[.*?\])/)) == null ? void 0 : _g[1];
          downloadObj = (_h = metadataJSON == null ? void 0 : metadataJSON.match(/downloads:\s?.*?SUB:\s?(\[.*?\])/)) == null ? void 0 : _h[1];
          downloadObjDUB = (_i = metadataJSON == null ? void 0 : metadataJSON.match(/downloads:\s?.*?DUB:\s?(\[.*?\])/)) == null ? void 0 : _i[1];
          raw = [];
          if (serversObj) raw = raw.concat(serversObj.split("},").map(function (s) {
            var _a2, _b2;
            return {
              title: (_a2 = s.match(/server:\s?"(.*?)"/)) == null ? void 0 : _a2[1],
              code: (_b2 = s.match(/url:\s?"(.*?)"/)) == null ? void 0 : _b2[1],
              dub: false
            };
          }));
          if (downloadObj) raw = raw.concat(downloadObj.split("},").map(function (s) {
            var _a2, _b2;
            return {
              title: (_a2 = s.match(/server:\s?"(.*?)"/)) == null ? void 0 : _a2[1],
              code: (_b2 = s.match(/url:\s?"(.*?)"/)) == null ? void 0 : _b2[1],
              dub: false
            };
          }));
          if (serversObjDUB) raw = raw.concat(serversObjDUB.split("},").map(function (s) {
            var _a2, _b2;
            return {
              title: (_a2 = s.match(/server:\s?"(.*?)"/)) == null ? void 0 : _a2[1],
              code: (_b2 = s.match(/url:\s?"(.*?)"/)) == null ? void 0 : _b2[1],
              dub: true
            };
          }));
          if (downloadObjDUB) raw = raw.concat(downloadObjDUB.split("},").map(function (s) {
            var _a2, _b2;
            return {
              title: (_a2 = s.match(/server:\s?"(.*?)"/)) == null ? void 0 : _a2[1],
              code: (_b2 = s.match(/url:\s?"(.*?)"/)) == null ? void 0 : _b2[1],
              dub: true
            };
          }));
          _servers = raw.filter(function (s) {
            return s.title && Object.keys(SOURCE_EXTRACTORS).some(function (key) {
              return s.title.includes(key);
            }) && s.code;
          }).map(function (s) {
            return {
              name: s.title,
              url: s.code,
              dub: s.dub
            };
          });
          console.log(`[AnimeAV1] HTML scraping OK: ${_servers.length} servidores soportados`);
          return _context9.a(2, _servers);
        case 20:
          _context9.p = 20;
          _t0 = _context9.v;
          console.error("[AnimeAV1] Error en fallback HTML:", _t0.message);
          return _context9.a(2, []);
      }
    }, _callee9, null, [[18, 20], [6, 10, 11, 12], [1, 17]]);
  }));
  return _getEpisodeServers.apply(this, arguments);
}
function extractZillaHLS(_x10) {
  return _extractZillaHLS.apply(this, arguments);
}
function _extractZillaHLS() {
  _extractZillaHLS = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee0(playUrl) {
    var directUrl;
    return _regenerator().w(function (_context0) {
      while (1) switch (_context0.n) {
        case 0:
          directUrl = playUrl.replace("/play/", "/m3u8/");
          console.log(`[HLS-zilla] URL construida: ${directUrl}`);
          return _context0.a(2, {
            url: directUrl,
            headers: {
              "Referer": "https://player.zilla-networks.com/",
              "Sec-Fetch-Site": "same-origin",
              "Sec-Fetch-Mode": "cors",
              "Sec-Fetch-Dest": "empty",
              "User-Agent": UA
            },
            type: "hls"
          });
      }
    }, _callee0);
  }));
  return _extractZillaHLS.apply(this, arguments);
}
function extractMP4Upload(_x11) {
  return _extractMP4Upload.apply(this, arguments);
}
function _extractMP4Upload() {
  _extractMP4Upload = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee1(embedUrl) {
    var origin, resp, data, match;
    return _regenerator().w(function (_context1) {
      while (1) switch (_context1.n) {
        case 0:
          origin = function () {
            try {
              return new URL(embedUrl).origin;
            } catch (_) {
              return "https://www.mp4upload.com";
            }
          }();
          _context1.n = 1;
          return fetch(embedUrl, {
            headers: {
              "Referer": origin,
              "Origin": origin,
              "User-Agent": UA
            }
          });
        case 1:
          resp = _context1.v;
          if (resp.ok) {
            _context1.n = 2;
            break;
          }
          throw Error(`HTTP error! Status: ${resp.status}`);
        case 2:
          _context1.n = 3;
          return resp.text();
        case 3:
          data = _context1.v;
          match = /<script(?:.|\n)+?src:(?:.|\n)*?"(.+?\.mp4)"/g.exec(data);
          if (!(!match || !match[1])) {
            _context1.n = 4;
            break;
          }
          throw Error("No se encontr\xF3 URL .mp4 en el embed de MP4Upload");
        case 4:
          console.log(`[MP4Upload] URL extra\xEDda: ${match[1]}`);
          return _context1.a(2, {
            url: match[1],
            headers: {
              Referer: "https://www.mp4upload.com",
              Origin: "https://www.mp4upload.com",
              "User-Agent": UA
            }
          });
      }
    }, _callee1);
  }));
  return _extractMP4Upload.apply(this, arguments);
}
Object.assign(SOURCE_EXTRACTORS, {
  HLS: {
    label: "HLS",
    extract: extractZillaHLS
  },
  MP4Upload: {
    label: "MP4Upload",
    extract: extractMP4Upload
  }
});
var getLangLabel = function getLangLabel(dub) {
  return dub ? "\u{1F1F2}\u{1F1FD} LATINO" : "\u{1F1EF}\u{1F1F5} JAPON\xC9S \xB7 \u{1F1F2}\u{1F1FD} Sub";
};
exports.getStreams = /*#__PURE__*/function () {
  var _ref = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2(tmdbId, type, season, episode) {
    var info, reason, seasonNum, seasonYear, searchTerm, aniListInfo, candidates, match, epNumber, servers, sourceOrder, results, final, _t2;
    return _regenerator().w(function (_context2) {
      while (1) switch (_context2.p = _context2.n) {
        case 0:
          if (!(!tmdbId || !type)) {
            _context2.n = 1;
            break;
          }
          return _context2.a(2, []);
        case 1:
          console.log(`[AnimeAV1] Buscando: TMDB ${tmdbId} (${type}) S${season != null ? season : "-"}E${episode != null ? episode : "-"}`);
          _context2.p = 2;
          _context2.n = 3;
          return getTMDBInfo(tmdbId, type);
        case 3:
          info = _context2.v;
          if (info) {
            _context2.n = 4;
            break;
          }
          return _context2.a(2, []);
        case 4:
          if (looksLikeAnime(info)) {
            _context2.n = 5;
            break;
          }
          reason = !looksLikeAsianOrigin(info.originCountries) ? `origen no asi\xE1tico (${info.originCountries.join(", ") || "desconocido"})` : `sin g\xE9nero Animation`;
          console.log(`[AnimeAV1] Descartado (${reason}), omitiendo b\xFAsqueda: "${info.title}"`);
          return _context2.a(2, []);
        case 5:
          seasonNum = type === "movie" ? 1 : season ? Number(season) : 1;
          searchTerm = seasonNum !== 1 ? `${info.title} ${seasonNum}` : info.title;
          if (!(type === "movie")) {
            _context2.n = 6;
            break;
          }
          seasonYear = info.year;
          _context2.n = 9;
          break;
        case 6:
          _context2.n = 7;
          return getSeasonYear(tmdbId, seasonNum);
        case 7:
          seasonYear = _context2.v;
          if (!(seasonYear === void 0)) {
            _context2.n = 9;
            break;
          }
          console.warn(`[AnimeAV1] TMDB sin a\xF1o para temporada ${seasonNum}, probando AniList`);
          _context2.n = 8;
          return getAniListInfo(info.title, seasonNum);
        case 8:
          aniListInfo = _context2.v;
          if (aniListInfo) {
            seasonYear = aniListInfo.year;
            searchTerm = aniListInfo.romajiTitle;
          }
        case 9:
          console.log(`[AnimeAV1] searchTerm="${searchTerm}" year=${seasonYear != null ? seasonYear : "ninguno"}`);
          _context2.n = 10;
          return searchAnimeAV1(searchTerm, seasonYear);
        case 10:
          candidates = _context2.v;
          match = pickBestMatch(candidates, searchTerm, seasonNum);
          console.log(`[AnimeAV1] Match elegido: "${match.title}" (${match.slug})`);
          epNumber = type === "movie" ? 1 : episode !== void 0 ? Number(episode) : 1;
          _context2.n = 11;
          return getEpisodeServers(match.slug, epNumber);
        case 11:
          servers = _context2.v;
          if (!(servers.length === 0 && type === "movie" && epNumber === 1)) {
            _context2.n = 13;
            break;
          }
          console.warn(`[AnimeAV1] Reintentando pel\xEDcula con episodio 0`);
          _context2.n = 12;
          return getEpisodeServers(match.slug, 0);
        case 12:
          servers = _context2.v;
        case 13:
          if (!(servers.length === 0)) {
            _context2.n = 14;
            break;
          }
          console.warn(`[AnimeAV1] Sin servidores soportados para "${match.title}"`);
          return _context2.a(2, []);
        case 14:
          sourceOrder = Object.keys(SOURCE_EXTRACTORS);
          servers = _toConsumableArray(servers).sort(function (a, b) {
            var aIdx = sourceOrder.findIndex(function (key) {
              return a.name.includes(key);
            });
            var bIdx = sourceOrder.findIndex(function (key) {
              return b.name.includes(key);
            });
            if (aIdx !== bIdx) return aIdx - bIdx;
            return (a.dub ? 1 : 0) - (b.dub ? 1 : 0);
          });
          _context2.n = 15;
          return Promise.all(servers.map(/*#__PURE__*/function () {
            var _ref2 = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee(server) {
              var sourceKey, source, resolved, label, _t;
              return _regenerator().w(function (_context) {
                while (1) switch (_context.p = _context.n) {
                  case 0:
                    sourceKey = Object.keys(SOURCE_EXTRACTORS).find(function (key) {
                      return server.name.includes(key);
                    });
                    source = sourceKey ? SOURCE_EXTRACTORS[sourceKey] : null;
                    if (source) {
                      _context.n = 1;
                      break;
                    }
                    return _context.a(2, null);
                  case 1:
                    _context.p = 1;
                    _context.n = 2;
                    return source.extract(server.url);
                  case 2:
                    resolved = _context.v;
                    label = `\u{1F4FA} ${source.label} | 1080p | WEB-DL | ${getLangLabel(server.dub)}`;
                    return _context.a(2, __spreadValues({
                      name: `AnimeAV1`,
                      title: label,
                      url: resolved.url,
                      quality: label,
                      headers: resolved.headers
                    }, resolved.type ? {
                      type: resolved.type
                    } : {}));
                  case 3:
                    _context.p = 3;
                    _t = _context.v;
                    console.warn(`[${source.label}] Fall\xF3 resolviendo un servidor: ${_t.message}`);
                    return _context.a(2, null);
                }
              }, _callee, null, [[1, 3]]);
            }));
            return function (_x16) {
              return _ref2.apply(this, arguments);
            };
          }()));
        case 15:
          results = _context2.v;
          final = results.filter(Boolean);
          console.log(`[AnimeAV1] \u2713 ${final.length} streams devueltos`);
          return _context2.a(2, final);
        case 16:
          _context2.p = 16;
          _t2 = _context2.v;
          console.error(`[AnimeAV1] Error: ${_t2.message}`);
          return _context2.a(2, []);
      }
    }, _callee2, null, [[2, 16]]);
  }));
  return function (_x12, _x13, _x14, _x15) {
    return _ref.apply(this, arguments);
  };
}();