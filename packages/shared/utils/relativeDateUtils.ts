interface RelativeDate {
  direction: "newer" | "older";
  amount: number;
  unit: "day" | "week" | "month" | "year";
}

const parseRelativeDate = (date: string): RelativeDate => {
  const match = /^([<>])(\d+)([dwmy])$/.exec(date);
  if (!match) {
    throw new Error(`Invalid relative date format: ${date}`);
  }
  const direction = match[1] === "<" ? "newer" : "older";
  const amount = parseInt(match[2], 10);
  const unit = {
    d: "day",
    w: "week",
    m: "month",
    y: "year",
  }[match[3]] as "day" | "week" | "month" | "year";
  return { direction, amount, unit };
};

const toAbsoluteDate = (relativeDate: RelativeDate): Date => {
  const date = new Date();
  switch (relativeDate.unit) {
    case "day":
      date.setDate(date.getDate() - relativeDate.amount);
      break;
    case "week":
      date.setDate(date.getDate() - relativeDate.amount * 7);
      break;
    case "month":
      date.setMonth(date.getMonth() - relativeDate.amount);
      break;
    case "year":
      date.setFullYear(date.getFullYear() - relativeDate.amount);
      break;
  }
  return date;
};

export { parseRelativeDate, toAbsoluteDate };
