const maximumPrice = 9_999_999_999.99;

/** Parses only arithmetic; owner input is never executed as JavaScript. */
export function priceFromExpression(input: string): number {
  if (input.length > 512) return 0;
  const source = input
    .normalize("NFKC")
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll("−", "-");
  let position = 0;
  let depth = 0;
  const whitespace = () => {
    while (/\s/.test(source[position] ?? "") && position < source.length) position++;
  };
  function primary(): number {
    whitespace();
    if (++depth > 32) throw new Error("Expression is too deeply nested");
    let value: number;
    const token = source[position];
    if (token === "+" || token === "-") {
      position++;
      value = primary() * (token === "-" ? -1 : 1);
    } else if (token === "(") {
      position++;
      value = sum();
      whitespace();
      if (source[position++] !== ")") throw new Error("Unclosed parentheses");
    } else {
      const number = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(position));
      if (!number) throw new Error("Expected a number");
      position += number[0].length;
      value = Number(number[0]);
    }
    depth--;
    return value;
  }
  function product(): number {
    let value = primary();
    whitespace();
    while (source[position] === "*" || source[position] === "/") {
      const operation = source[position++];
      const right = primary();
      if (operation === "/" && right === 0) throw new Error("Division by zero");
      value = operation === "*" ? value * right : value / right;
      if (!Number.isFinite(value)) throw new Error("Non-finite result");
      whitespace();
    }
    return value;
  }
  function sum(): number {
    let value = product();
    whitespace();
    while (source[position] === "+" || source[position] === "-") {
      const operation = source[position++];
      const right = product();
      value = operation === "+" ? value + right : value - right;
      whitespace();
    }
    return value;
  }
  try {
    const value = sum();
    whitespace();
    if (position !== source.length || !Number.isFinite(value) || value < 0 || value > maximumPrice)
      return 0;
    return Math.round((value + Number.EPSILON * Math.abs(value)) * 100) / 100;
  } catch {
    return 0;
  }
}
