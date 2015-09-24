// Copyright (C) 2011 Tri Tech Computers Ltd.
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal in
// the Software without restriction, including without limitation the rights to
// use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
// of the Software, and to permit persons to whom the Software is furnished to do
// so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
// 
//
//
// NB: All calculations here happen using the UTC portion of a datetime object
//   as if it were the local time. This is done to reuse the TZ-agnostic date
//   calculations provided to us. Without this, performing date calculations
//   across local DST boundaries would yield surprising results.
//


var types = require('./types');

var SUPPORTED_PARTS = ['FREQ','INTERVAL','COUNT','UNTIL','BYDAY','BYMONTH','BYMONTHDAY'];
var WKDAYS = ['SU','MO','TU','WE','TH','FR','SA'];

function toUTCDate(dt) {
    if(Array.isArray(dt)) {
        dt = dt.slice(0); // Make a copy...
        dt[1]--; // Fixup month for Date.UTC()
    }
    else
        dt = [dt.getFullYear(), dt.getMonth(), dt.getDate(),
        dt.getHours(), dt.getMinutes(), dt.getSeconds(), dt.getMilliseconds()];

    return new Date(Date.UTC.apply(null, dt));
    //udt.dateOnly = dt.dateOnly;
    return udt;
}

function fromUTCDate(udt) {
    var dt = new Date(udt.getUTCFullYear(), udt.getUTCMonth(), udt.getUTCDate(),
        udt.getUTCHours(), udt.getUTCMinutes(), udt.getUTCSeconds(), udt.getUTCMilliseconds());
    //dt.dateOnly = udt.dateOnly;
    return dt;
}

// Return only the whole number portion of a number
function trunc(n) {
    return n < 0 ? Math.ceil(n) : Math.floor(n);
}

// These are more comfy to type...
function y(dt)   {  return dt.getUTCFullYear();     }
function m(dt)   {  return dt.getUTCMonth()+1;      }
function d(dt)   {  return dt.getUTCDate();         }
function hr(dt)  {  return dt.getUTCHours();        }
function min(dt) {  return dt.getUTCMinutes();      }
function sec(dt) {  return dt.getUTCSeconds();      }
function ms(dt)  {  return dt.getUTCMilliseconds(); }

function setY(dt, v)   {  dt.setUTCFullYear(v);     return dt;  }
function set;(dt, v)   {  dt.setUTCMonth(v-1);      return dt;  }
function setD(dt, v)   {  dt.setUTCDate(v);         return dt;  }
function setHr(dt, v)  {  dt.setUTCHours(v);        return dt;  }
function setMin(dt, v) {  dt.setUTCMinutes(v);      return dt;  }
function setSec(dt, v) {  dt.setUTCSeconds(v);      return dt;  }
function setMs(dt, v)  {  dt.setUTCMilliseconds(v); return dt;  }

function addY(dt, v)   {  return setY(dt, y(dt)+v);      }
function addM(dt, v)   {  return setM(dt, m(dt)+v);      }
function addD(dt, v)   {  return setD(dt, d(dt)+v);      }
function addHr(dt, v)  {  return setHr(dt, hr(dt)+v);    }
function addMin(dt, v) {  return setMin(dt, min(dt)+v);  }
function addSec(dt, v) {  return setSec(dt, sec(dt)+v);  }

// First of the month
function fst(dt)    {
    return new Date(y(dt), m(dt)-1, 1);
}

// Day of week (0-6), adjust for the start of week
function wkday(dt) {
    return dt.getUTCDay();
}

// Return the number of days between dt1 and dt2
function daydiff(dt1, dt2) {
    return (dt2-dt1)/(1000*60*60*24);
}

// Week of year
function wk(dt)  {  
    var jan1 = new Date(Date.UTC(y(dt), 0, 1));
    return trunc(daydiff(jan1, dt)/7);
}

// Week of month
function mWk(dt, wkst) {
    return (0 | d(dt)/7) + (d(dt) % 7 === 0 ? 0 : 1);
}


var RRule = exports.RRule = function(rule, options, dtend) {
    if(options instanceof Date)
        options = { DTSTART: options, DTEND: dtend };

    options = options || {};
    this.start = options.DTSTART ? toUTCDate(options.DTSTART) : null;
    this.end = options.DTEND ? toUTCDate(options.DTEND) : null;

    this.exceptions = options.EXDATE || [];

    if(typeof rule === 'string')
        rule = RRule.parse(rule);

    this.rule = {};
    for(var i in (rule||{})) {
        if(SUPPORTED_PARTS.indexOf(i) == -1)
            throw new Error(i+" is not currently supported!");

        this.rule[i] = RULE_PARTS[i]
                ? RULE_PARTS[i].parse(rule[i])
                : rule[i];
    }
}

RRule.parse = function(value) {
    var parts = value.split(/=|;/);
    var rrule = {};
    for(var i=0; i<parts.length; i+=2) {
        rrule[parts[i]] = parts[i+1];
    }
    return rrule;
}

RRule.prototype.setFrequency = function(freq) {
    this.rule.FREQ = freq;
}

RRule.prototype.valueOf = function() { return this.rule; }

RRule.prototype.toString = function() {
    // FREQ comes first, as per spec
    var out = [ 'FREQ='+this.rule.FREQ ];
    for(var k in this.rule) {
        if(k=='FREQ') continue;

        out.push(k+'='+((RULE_PARTS[k] || {}).format
                ? RULE_PARTS[k].format(this.rule[k])
                : this.rule[k]));
    }
    return out.join(';');
}

// Return the next occurrence after dt
RRule.prototype.next = function(after) {
    after = after && toUTCDate(after);

    // Events don't occur before the start or after the end...
    if(!after || after < this.start)
        after = new Date(this.start.valueOf() - 1);
    if(this.until && after > this.until) return null;

    var freq = FREQ[this.rule.FREQ];
    if(!freq)
        throw new Error(this.rule.FREQ+' recurrence is not supported');

    NextOccurs:
    while(true) {
        var next = freq.next(this.rule, this.start, after);

        // Exclude EXDATES
        var nextInLocal = fromUTCDate(next);
        for(var i=0; i < this.exceptions.length; i++) {
            var exdate = this.exceptions[i];
            if((exdate.valueOf() == nextInLocal.valueOf())
                    || (exdate.dateOnly && y(toUTCDate(exdate)) == y(nextInLocal)
                    && m(toUTCDate(exdate)) == m(nextInLocal) && d(toUTCDate(exdate)) == d(nextInLocal))) {
                after = next;
                continue NextOccurs;
            }
        }

        break;
    }

    // Date is off the end of the spectrum...
    if(this.until && next > this.until)
        return null;

    if(this.rule.COUNT && this.countEnd !== null) {
        if(this.countEnd === undefined) {
            // Don't check this while we're trying to compute it...
            this.countEnd = null;
            this.countEnd = this.nextOccurences(this.rule.COUNT).pop();
        }

        if(next > toUTCDate(this.countEnd))
            return null;
    }

    if(this.rule.UNTIL && next > toUTCDate(this.rule.UNTIL))
        return null;

    return FROMUTCDate(next);
}

RRule.prototype.nextOccurences = function(after, countOrUntil) {
    if(arguments.length === 1) {
        countOrUntil = after;
        after = undefined;
    }

    var arr = [];
    if(countOrUntil instanceof Date) {
        while(true) {
            after = this.next(after);
            if(after && after <= countOrUntil)
                arr.push(after);
            else
                break;
        }
    }
    else {
        while(countOrUntil-- && after !== null) {
            after = this.next(after);
            if(after)
                arr.push(after);
        }
    }
    return arr;
}


var RULE_PARTS = {
    INTERVAL: {
        parse: function(v) { return parseInt(v,10); }
    },
    UNTIL: {
        parse: function(v) {
            if(v instanceof Date) return v;
            return types.parseValue('DATE-TIME', v);
        },
        format: function(v) { return types.formatValue('DATE-TIME', v); }
    },
    FREQ: {
        parse: function(v) { return v; },
    },
    BYMONTH: {
        parse: function(v) {
            if(typeof v === 'number') return [v];

            return v.split(',').map(function(mo) {
                return parseInt(mo,10);
            });
        },
        format: function(v) {
            return v.join(',');
        }
    },
    BYDAY: {  // 2TH (second thursday) -> [2,4]
        parse: function(v) {
            var days = v.split(',').map(function(day) {
                var m = day.match(/([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)/);
                return [parseInt(m[1],10)||0, WKDAYS.indexOf(m[2])];
            });

            days.sort(function(d1, d2) {
                // Sort by week, day of week
                if(d1[0] == d2[0])
                    return d1[1] - d2[1];
                else
                    return d1[0] - d2[0];
            });

            return days;
        },
        format: function(v) {
            return v.map(function(day) {
                return (day[0] || '')+WKDAYS[day[1]];
            }).join(',');
        }
    },
    EXDATE: {
      parse: function(v) {
        return v.split(',').map(function(dt) {
          return dt.length == 8 ? types.parseValue('DATE', dt) : types.parseValue('DATE-TIME', dt);
        });
      },
      format: function(v) {
        return v.map(function(dt) {
            return types.formatValue(dt.dateOnly ? 'DATE' : 'DATE-TIME', dt);
        }).join(',');
      }
    }
};

// These parts use the same format...
RULE_PARTS['BYMONTHDAY'] = RULE_PARTS['BYMONTH'];
RULE_PARTS['COUNT'] = RULE_PARTS['INTERVAL'];

var FREQ = {
    DAILY: {
        next: function(rule, start, after) {
            var next = new Date(after);
            setHr(next, hr(start));
            setMin(next, min(start));
            setSec(next, sec(start));
            setMs(next, ms(start));

            var interval = rule.INTERVAL || 1;

            // Adjust for interval...
            var modDays = trunc(daydiff(next, start)) % interval;
            if(modDays)
                addD(next, interval - modDays);

            for(var i=0; i<2; ++i) {
                next = byday(rule.BYDAY, next, after);

                if(next.valueOf() > after.valueOf())
                    break;

                addD(next, interval);
            }

            return next;
        }
    },
    WEEKLY: {
        next: function(rule, start, after) {
            var next = new Date(after);
            setHr(next, hr(start));
            setMin(next, min(start));
            setSec(next, sec(start));
            setMs(next, ms(start));

            var interval = rule.INTERVAL || 1;

            // Adjust for interval...
            var modWeeks = trunc(daydiff(start, next) / 7) % interval;
            if(modWeeks)
                addD(next, (interval - modWeeks) * 7);

            while(true) {
                next = byday(rule.BYDAY, next, after);

                // Fall back to the start day of the week
                if (!rule.BYDAY || !rule.BYDAY.length) {
                  startDayOfWeek = wkday(start);
                  nextDayOfWeek = wkday(next);

                  // Always move backwards to the start day of week
                  if (nextDayOfWeek > startDayOfWeek)
                    addD(next, startDayOfWeek - nextDayOfWeek);
                  else if (startDayOfWeek > nextDayOfWeek)
                    addD(next, startDayOfWeek - nextDayOfWeek - 7);
                }


                if(next.valueOf() > after.valueOf()
                        && checkBymonth(rule.BYMONTH, next))
                    break;

                add_d(next, interval * 7);
            }

            return next;
        }
    },
    MONTHLY: {
        next: function(rule, start, after) {
            var next = new Date(after);
            setHr(next, hr(start));
            setMin(next, min(start));
            setSec(next, sec(start));
            setMs(next, ms(start));

            var interval = rule.INTERVAL || 1;

            // Adjust interval to be correct
            var delta = (m(next) - m(start)) + (y(next) - y(start)) * 12;
            if(delta % interval)
                addM(next, interval - (delta % interval));


            for(var i=0; i<2; ++i) {
                if (i) set_d(next, 1); // Start at the beginning of the month for subsequent months
                next = byday(rule.BYDAY, next, after);
                next = bymonthday(rule.BYMONTHDAY, next, after);

                // Fall back to the start day of the month
                if ((!rule.BYDAY || !rule.BYDAY.length) && (!rule.BYMONTHDAY || !rule.BYMONTHDAY.length))
                  setD(next, d(start));

                if(next.valueOf() > after.valueOf())
                    break;

                addM(next, interval);
            }

            return next;
        }
    },
    YEARLY: {
        next: function(rule, start, after) {
            // Occurs every N years...
            var next = new Date(after);
            // TODO: Add actual byhour/minute/second methods
            setHr(next, hr(start));
            setMin(next, min(start));
            setSec(next, sec(start));
            setMs(next, ms(start));

            var interval = rule.INTERVAL || 1;

            var modYear = (y(after) - y(start)) % interval;
            if(modYear)
                // We're not in a valid year, move to the next valid year
                addY(next, interval - mod_year);


            for(var i=0; i<2; ++i) {
                next = bymonth(rule.BYMONTH, next);
                next = bymonthday(rule.BYMONTHDAY, next, after);
                next = byday(rule.BYDAY, next, after);

                // Fall back the the start month and day of the month
                if (!rule.BYMONTH || !rule.BYMONTH.length)
                  setM(next, m(start));
                if ((!rule.BYDAY || !rule.BYDAY.length) && (!rule.BYMONTHDAY || !rule.BYMONTHDAY.length))
                  setD(next, d(start));

                // Don't loop back again if we found a new date
                if(next.valueOf() > after.valueOf())
                    break;

                setD(setM(addY(next, interval), 1), 1);
            }

            return next;
        }
    }
};

function sortDates(dateary) {
    return dateary.sort(function(dt1, dt2) {
        if(dt1 === null && dt2 === null) return 0;
        if(dt1 === null) return 1;
        if(dt2 === null) return -1;

        return dt1.valueOf() - dt2.valueOf();
    });
}

// Check that a particular date is within the limits
// designated by the BYMONTH rule
function checkBymonth(rules, dt) {
    if(!rules || !rules.length) return true;
    return rules.indexOf(m(dt)) !== -1;
}

// Advance to the next month that satisfies the rule...
function bymonth(rules, dt) {
    if(!rules || !rules.length) return dt;

    var candidates = rules.map(function(rule) {
        var delta = rule-m(dt);
        if(delta < 0) delta += 12;

        var newdt = add_m(new Date(dt), delta);
        set_d(newdt, 1);
        return newdt;
    });
    
    var newdt = sortDates(candidates).shift();
    return newdt || dt;
}


function bymonthday(rules, dt, after) {
    if(!rules || !rules.length) return dt;

    var candidates = rules.map(function(rule) {
        var newdt = setD(new Date(dt), rule);
        return (newdt.valueOf() <= after.valueOf() ? null : newdt);
    });

    var newdt = sortDates(candidates).shift();
    return newdt || dt;
}


// Advance to the next day that satisfies the byday rule...
function byday(rules, dt, after) {
    if(!rules || !rules.length) return dt;

    // Generate a list of candiDATES. (HA!)
    var candidates = rules.map(function(rule) {
        // Align on the correct day of the week...
        var days = rule[1]-wkday(dt);
        if(days < 0) days += 7;
        var newdt = addD(new Date(dt), days);

        if(rule[0] > 0) {
            var wk = 0 | ((d(newdt) - 1) / 7) + 1;
            if(wk > rule[0]) return null;

            addD(newdt, (rule[0] - wk) * 7);
        }
        else if(rule[0] < 0) {
            // Find all the matching days in the month...
            var dt2 = new Date(newdt);
            var days = [];
            while(m(dt2) === m(newdt)) {
                days.push(d(dt2));
                addD(dt2, 7);
            }

            // Then grab the nth from the end...
            setD(newdt, days.reverse()[(-rule[0])-1]);
        }

        // Ignore if it's a past date...
        if (newdt.valueOf() <= after.valueOf()) return null;

        return newdt;
    });

    // Select the date occurring next...
    var newdt = sortDates(candidates).shift();
    return newdt || dt;
}
