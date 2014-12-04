var $cmanager = new ComponentManager();

var COM_DATA_BIND_SELECTOR = 'input[data-component-bind],textarea[data-component-bind],select[data-component-bind]';
var COM_ATTR = '[data-component]';
var COM_ATTR_URL = '[data-component-url]';
var COM_ATTR_P = 'data-component-path';
var COM_ATTR_T = 'data-component-template';

$.fn.component = function() {
    return this.data(COM_ATTR);
};

$.components = function(container) {

    $.components.inject();

    if ($cmanager.pending.length > 0) {
        $cmanager.pending.push(function() {
            $.components(container);
        });
        return self;
    }

    var els = container ? container.find(COM_ATTR) : $(COM_ATTR);

    els.each(function() {

        var el = $(this);
        var name = el.attr('data-component');

        if (el.data(COM_ATTR))
            return;

        var component = $cmanager.register[name || ''];
        if (!component)
            return;

        var obj = component(el);

        // Reference to implementation
        el.data(COM_ATTR, obj);

        var template = el.attr(COM_ATTR_T) || obj.template;
        if (template)
            obj.template = template;

        if (typeof(template) === 'string') {
            var fn = function(data) {
                if (obj.prerender)
                    data = prerender(data);
                if (typeof(obj.make) === 'function')
                    obj.make(data);
                component_init(el, obj);
            };

            var c = template.substring(0, 1);
            if (c === '.' || c === '#' || c === '[')
                fn($(c).html());
            else
                $.get(template, fn);
            return;
        }

        if (typeof(obj.make) === 'string') {

            if (obj.make.indexOf('<') !== -1) {
                if (obj.prerender)
                    obj.make = obj.prerender(obj.make);
                el.html(obj.make);
                component_init(el, obj);
                return;
            }

            $.get(obj.make, function(data) {
                if (obj.prerender)
                    data = prerender(data);
                el.html(data);
                component_init(el, obj);
            });

            return;
        }

        if (obj.make)
            obj.make();

        component_init(el, obj);
    });

    if (container !== undefined) {
        $cmanager.next();
        return;
    }

    if ($cmanager.toggle.length === 0) {
        $cmanager.next();
        return;
    }

    component_async($cmanager.toggle, function(item, next) {
        for (var i = 0, length = item.toggle.length; i < length; i++)
            item.element.toggleClass(item.toggle[i]);
        next();
    }, function() {
        $cmanager.next();
    });
};

$.components.$formatter = [];
$.components.$parser = [];

$.components.inject = function() {

    var els = $(COM_ATTR_URL);
    var arr = [];
    var count = 0;

    els.each(function() {
        var el = $(this);
        if (el.data(COM_ATTR_URL))
            return;
        el.data(COM_ATTR_URL, '1');
        arr.push({ element: el, path: el.attr(COM_ATTR_P), url: el.attr('data-component-url'), toggle: (el.attr('data-component-class') || '').split(' ') });
    });

    if (arr.length === 0)
        return;

    component_async(arr, function(item, next) {
        item.element.load(item.url, function() {

            if (item.path) {
                var com = item.element.find(COM_ATTR);
                com.each(function() {
                    var el = $(this);
                    $.each(this.attributes, function() {
                        if (!this.specified)
                            return;
                        el.attr(this.name, this.value.replace('$', item.path));
                    });
                });
            }

            if (item.toggle.length > 0 && item.toggle[0] !== '')
                $cmanager.toggle.push(item);

            count++;
            next();
        });

    }, function() {
        $cmanager.clear();
        if (count === 0)
            return;
        $.components();
    });
};

$.components.ready = function(fn) {
    $cmanager.ready.push(fn);
};

function $components_ready() {
    clearTimeout($cmanager.timeout);
    $cmanager.timeout = setTimeout(function() {

        $cmanager.initialize();

        var count = $cmanager.components.length;
        $(document).trigger('components', [count]);

        if (!$cmanager.isReady) {
            $cmanager.clear();
            $cmanager.isReady = true;
            $.components.emit('init');
            $.components.emit('ready');
        }

        if (!$cmanager.ready)
            return;

        var arr = $cmanager.ready;
        for (var i = 0, length = arr.length; i < length; i++)
            arr[i](count);

        delete $cmanager.ready;
    }, 100);
}

$.components.on = function(name, path, fn, context) {

    if (typeof(path) === 'function') {
        fn = path;
        path = '';
    }
    if (context === undefined)
        context = $.components;

    if (!$cmanager.events[path]) {
        $cmanager.events[path] = {};
        $cmanager.events[path][name] = [];
    } else if (!$cmanager.events[path][name])
        $cmanager.events[path][name] = [];
    $cmanager.events[path][name].push({ fn: fn, context: context });
    return this;
};

function component_init(el, obj) {

    function change_value(el) {
        var plain = el.get(0);
        var path = el.attr('data-component-bind');
        if (path && path.length > 0 && path !== obj.path)
            return;

        if (!obj.getter)
            return;

        obj.dirty(false);
        var value = plain.type === 'checkbox' ? plain.checked : el.val();
        obj.getter(value, 2);
    }

    function binder(e) {

        var el = $(this);

        var skip = el.data('skip');

        if (skip && skip !== e.type) {
            el.removeData('skip');
            return;
        }

        if (this.tagName !== 'SELECT') {
            if (e.type === 'blur' || (this.type == 'checkbox' || this.type === 'radio')) {
                obj.$can = true;
                clearTimeout(el.data('delay'));
                el.data('skip', e.type);
                change_value(el);
                return;
            }
            obj.$can = false;
        }

        if (e.type === 'change' && this.tagName !== 'SELECT') {
            var type = this.type.toLowerCase();
            if (type !== 'checkbox' && type !== 'radio')
                return;
        }

        clearTimeout(el.data('delay'));
        el.data('delay', setTimeout(function() {
            el.data('skip', e.type);
            change_value(el);
        }, 300));
    }

    var type = el.get(0).tagName;
    obj.type = el.attr('data-component-type') || '';

    // autobind
    if (type === 'INPUT' || type === 'SELECT' || type === 'TEXTAREA') {
        if (obj.type === '') {
            obj.$input = true;
            obj.$can = true;
            el.bind('change blur keydown', binder).attr('data-component-bind', obj.path);
        }
    } else {
        el.find(COM_DATA_BIND_SELECTOR).bind('change blur keydown', binder).attr('data-component-bind', obj.path);
        obj.$can = true;
    }

    $cmanager.components.push(obj);
    $cmanager.init.push(obj);
    $.components(el);
    $components_ready();
}

$.components.version = 'v1.0.0';
$.components.valid = function(path, value) {

    var key = 'valid' + path;

    if (typeof(value) !== 'boolean' && $cmanager.cache[key] !== undefined)
        return $cmanager.cache[key];

    var valid = true;
    var arr = value !== undefined ? [] : null;

    $.components.each(function(obj) {

        if (value !== undefined) {
            if (obj.state)
                arr.push(obj);
            obj.$valid = value;
            obj.$validate = false;
        }

        if (obj.$valid === false)
            valid = false;

    }, path);

    $.components.state(arr, 1);
    $cmanager.cache[key] = valid;

    return valid;
};

$.components.$emit2 = function(name, path, args) {

    var e = $cmanager.events[path];

    if (!e)
        return false;

    e = e[name];
    if (!e)
        return false;

    for (var i = 0, length = e.length; i < length; i++)
        e[i].fn.apply(e[i].context, args);

    return true;
};

$.components.$emitonly = function(name, paths) {

    var unique = {};
    var keys = Object.keys(paths);

    for (var a = 0, al = keys.length; a < al; a++) {
        var arr = keys[a].split('.');
        var p = '';
        for (var b = 0, bl = arr.length; b < bl; b++) {
            p += (p ? '.' : '') + arr[b];
            unique[p] = paths[p];
        }
    }

    Object.keys(unique).forEach(function(key) {
        $.components.$emit2(name, key, [key, unique[key]]);
    });

    return this;
};

$.components.$emit = function(name, path) {

    if (!path)
        return;

    var arr = path.split('.');
    var args = [];

    for (var i = name === 'watch' ? 1 : 2, length = arguments.length; i < length; i++)
        args.push(arguments[i]);

    $.components.$emit2(name, '*', args);

    var p = '';

    for (var i = 0, length = arr.length; i < length; i++) {

        var k = arr[i];
        var a = arr[i];

        if (a.substring(a.length - 1, a.length) === ']') {
            var beg = a.lastIndexOf('[');
            a = a.substring(0, beg);
        }

        p += (i > 0 ? '.' : '');

        args[1] = $.components.get(p + k);
        $.components.$emit2(name, p + k, args);
        if (k !== a)
            $.components.$emit2(name, p + a, args);

        p += k;
    }

    return true;
};

$.components.emit = function(name) {

    var e = $cmanager.events[''];
    if (!e)
        return false;

    e = $cmanager.events[''][name];
    if (!e)
        return false;

    var args = [];

    for (var i = 1, length = arguments.length; i < length; i++)
        args.push(arguments[i]);

    for (var i = 0, length = e.length; i < length; i++)
        e[i].fn.apply(e[i].context, arguments);

    return true;
};

$.components.dirty = function(path, value) {

    var key = 'dirty' + path;

    if (typeof(value) !== 'boolean' && $cmanager.cache[key] !== undefined)
        return $cmanager.cache[key];

    var dirty = true;
    var arr = value !== undefined ? [] : null;

    $.components.each(function(obj) {
        if (value !== undefined) {
            if (obj.state)
                arr.push(obj);
            obj.$dirty = value;
        }

        if (obj.$dirty === false)
            dirty = false;

    }, path);

    $cmanager.cache[key] = dirty;
    $.components.state(arr, 2);

    return dirty;
};

// 1 === by developer
// 2 === by input
$.components.update = function(path) {

    path = path.replace('.*', '');

    var state = [];
    var length = path.length;
    var was = false;
    var updates = {};

    $.components.each(function(component) {

        if (length > 0 && (!component.path || component.path.substring(0, length) !== path))
            return;

        var result = component.get();

        if (component.setter)
            component.setter(result);

        if (component.validate)
            component.valid(component.validate(result), true);

        if (component.state)
            state.push(component);

        if (component.watch !== null)
            component.watch(result, 1);

        if (component.path === path)
            was = true;

        updates[component.path] = result;
    });

    for (var i = 0, length = state.length; i < length; i++)
        state[i].state(1);

    $.components.$emitonly('watch', updates, 1);
    return $.components;
};

// 1 === by developer
// 2 === by input
$.components.set = function(path, value, type) {

    $cmanager.set(path, value);

    if (typeof(value) === 'object' && !(value instanceof Array) && value !== null && value !== undefined)
        return $.components.update(path);

    var result = $cmanager.get(path);
    var state = [];

    if (type === undefined)
        type = 1;

    $.components.each(function(component) {
        if (component.setter)
            component.setter(result);
        if (component.validate)
            component.valid(component.validate(result), true);
        if (component.state)
            state.push(component);
        if (component.watch !== null)
            component.watch(result, type);
    }, path);

    for (var i = 0, length = state.length; i < length; i++)
        state[i].state(type);

    $.components.$emit('watch', path, undefined, type);
    return $.components;
};

$.components.get = function(path) {
    return $cmanager.get(path);
};

$.components.remove = function(path) {
    $cmanager.clear();
    $.components.each(function(obj) {
        obj.remove(true);
    }, path);
    $cmanager.cleaner();
    return $.components;
};

$.components.validate = function(path) {

    var arr = [];
    var valid = true;

    $.components.each(function(obj) {

        var current = obj.path;

        if (obj.state)
            arr.push(obj);

        obj.$validate = true;

        if (obj.validate) {
            obj.$valid = obj.validate($cmanager.get(current));
            if (!obj.$valid)
                valid = false;
        }

    }, path);

    $cmanager.clear('valid');

    if (arr.length > 0)
        $.components.state(arr, 1);
    $.components.$emit('validate', path);
    return valid;
};

$.components.invalid = function(path) {
    var arr = [];
    $.components.each(function(obj) {
        if (obj.$valid === false)
            arr.push(obj);
    }, path);
    return arr;
};

$.components.state = function(arr, type) {

    if (!arr || arr.length === 0)
        return;

    for (var i = 0, length = arr.length; i < length; i++)
        arr[i].state(type);
};

$.components.reset = function(path) {

    var arr = [];
    $.components.each(function(obj) {
        if (obj.state)
            arr.push(obj);
        obj.$dirty = true;
        obj.$valid = true;
        obj.$validate = false;
        if (obj.validate)
            obj.$valid = obj.validate(obj.get(), 3);

    }, path);

    $cmanager.clear();
    $.components.state(arr, 3);
    $.components.$emit('reset', path);
    return $.components;
};

$.components.each = function(fn, path) {

    var isAsterix = path ? path.lastIndexOf('*') !== -1 : false;

    if (isAsterix)
        path = path.replace('.*', '').replace('*', '');

    for (var i = 0, length = $cmanager.components.length; i < length; i++) {

        var component = $cmanager.components[i];
        if (path) {
            if (!component.path)
                continue;
            if (isAsterix) {
                if (component.path.indexOf(path) !== 0)
                    continue;
            } else {
                if (path !== component.path)
                    continue;
            }
        }

        if (component && !component.$removed)
            fn(component);
    }

    return $.components;
};

function Component(name) {

    this._id = 'component' + Math.floor(Math.random() * 100000);

    this.$dirty = true;
    this.$valid = true;
    this.$validate = false;
    this.$can = true;
    this.$parser = [];
    this.$formatter = [];

    this.name = name;
    this.path;
    this.type;
    this.id;

    this.make;
    this.done;
    this.watch = null;
    this.prerender;
    this.destroy;
    this.state; // 0 init, 1 valid/validate, 2 dirty

    this.validate;

    this.getter = function(value, type) {
        value = this.parser(value);
        this.set(this.path, value, type);
        return this;
    };

    this.setter = function(value) {

        var self = this;

        if (!self.$can)
            return;

        var selector = self.$input === true ? this.element : this.element.find(COM_DATA_BIND_SELECTOR);
        value = self.formatter(value);
        var tmp = value !== null && value !== undefined ? value.toString().toLowerCase() : '';

        selector.each(function() {

            var el = $(this);
            var path = el.attr('data-component-bind');

            if (path && path.length > 0 && path !== self.path)
                return;

            if (this.type === 'checkbox') {
                this.checked = tmp === 'true' || tmp === '1' || tmp === 'on';
                return;
            }

            if (value === undefined || value === null)
                value = '';

            if (this.type === 'select-one') {
                el.val(value);
                return;
            }

            this.value = value;
        });
    };

    this.$parser.push(function(path, value, type) {

        if (type === 'number') {
            if (typeof(value) === 'string')
                value = value.replace(/\s/g, '').replace(/,/g, '.');
            var v = parseFloat(value);
            if (isNaN(v))
                v = null;
            return v;
        }

        return value;
    });
}

Component.prototype.valid = function(value, noEmit) {
    if (value === undefined)
        return this.$valid;

    this.$valid = value;
    this.$validate = false;

    $cmanager.clear('valid');

    if (noEmit)
        return this;

    if (this.state)
        this.state(1);

    return this;
};

Component.prototype.dirty = function(value) {

    if (value === undefined)
        return this.$dirty;

    this.$dirty = value;
    $cmanager.clear('dirty');

    if (this.state)
        this.state(2);

    return this;
};

Component.prototype.remove = function(noClear) {

    if (this.destroy)
        this.destroy();

    this.element.removeData(COM_ATTR);
    this.element.find(COM_DATA_BIND_SELECTOR).unbind('change');
    this.element.remove();

    if (!noClear)
        $cmanager.clear();

    $.components.$removed = true;
    $.components.state(undefined, 'destroy', this);
    $.components.$emit('destroy', this.name, this.element.attr(COM_ATTR_P));

    if (!noClear)
        $cmanager.cleaner();
    else
        $cmanager.refresh();

};

Component.prototype.on = function(name, path, fn) {

    if (typeof(path) === 'function') {
        fn = path;
        path = '';
    } else
        path = path.replace('.*', '');

    if (!$cmanager.events[path]) {
        $cmanager.events[path] = {};
        $cmanager.events[path][name] = [];
    } else if (!$cmanager.events[path][name])
        $cmanager.events[path][name] = [];
    $cmanager.events[path][name].push({ fn: fn, context: this, id: this._id });
    return this;
};

Component.prototype.formatter = function(value, g) {
    var a = g ? $.components.$formatter : this.$formatter;
    for (var i = 0, length = a.length; i < length; i++)
        value = a[i].call(this, this.path, value, this.type);
    return value;
};

Component.prototype.parser = function(value, g) {
    var a = g ? $.components.$parser : this.$parser;
    for (var i = 0, length = a.length; i < length; i++)
        value = a[i].call(this, this.path, value, this.type);
    return value;
};

Component.prototype.emit = function() {
    $.components.emit.apply($.components, arguments);
};

Component.prototype.get = function(path) {
    if (!path)
        path = this.path;
    if (!path)
        return;
    return $cmanager.get(path);
};

Component.prototype.set = function(path, value, type) {

    if (value === undefined) {
        value = path;
        path = this.path;
    }

    if (!path)
        return self;

    $.components.set(path, value, type);
    return self;
};

function COMPONENT(type, declaration) {

    var fn = function(el) {
        var obj = new Component(type);
        obj.element = el;
        obj.path = el.attr(COM_ATTR_P);
        declaration.call(obj);
        return obj;
    };

    $cmanager.register[type] = fn;
}

function component_async(arr, fn, done) {

    var item = arr.shift();
    if (item === undefined) {
        if (done)
            done();
        return;
    }

    fn(item, function() {
        component_async(arr, fn, done);
    });
}

function ComponentManager() {
    this.isReady = false;
    this.init = [];
    this.register = {};
    this.cache = {};
    this.model = {};
    this.components = [];
    this.toggle = [];
    this.ready = [];
    this.events = {};
    this.timeout;
    this.pending = [];
}

ComponentManager.prototype.initialize = function(obj) {

    if (!obj)
        return this;

    var value = obj.get();
    obj.id = el.attr('data-component-id') || name;

    if (obj.setter)
        obj.setter(value);

    if (obj.validate)
        obj.$valid = obj.validate(obj.get(), 0);

    if (obj.done)
        obj.done();

    if (obj.state)
        obj.state(0);

    if (obj.watch !== null)
        obj.watch(value, 0);

    el.trigger('component');
    el.off('component');

    var cls = el.attr('data-component-class');
    if (cls) {
        cls = cls.split(' ');
        for (var i = 0, length = cls.length; i < length; i++)
            el.toggleClass(cls[i]);
    }

    return this;
};

ComponentManager.prototype.initialize = function() {
    var item = this.init.pop();
    if (item === undefined) {
        $.components();
        return this;
    }
    this.prepare(item);
    this.initialize();
    return this;
};

ComponentManager.prototype.prepare = function(obj) {

    if (!obj)
        return this;

    var value = obj.get();
    var el = obj.element;
    obj.id = el.attr('data-component-id') || name;

    if (obj.setter)
        obj.setter(value);

    if (obj.validate)
        obj.$valid = obj.validate(obj.get(), 0);

    if (obj.done)
        obj.done();

    if (obj.state)
        obj.state(0);

    if (obj.watch !== null)
        obj.watch(value, 0);


    el.trigger('component');
    el.off('component');

    var cls = el.attr('data-component-class');
    if (cls) {
        cls = cls.split(' ');
        for (var i = 0, length = cls.length; i < length; i++)
            el.toggleClass(cls[i]);
    }

    return this;
};

ComponentManager.prototype.next = function() {
    var next = this.pending.shift();
    if (next === undefined)
        return this;
    next();
};

/**
 * Clear cache
 * @param {String} name
 * @return {ComponentManager}
 */
ComponentManager.prototype.clear = function(name) {

    var self = this;
    var arr = Object.keys(self.cache);

    for (var i = 0, length = arr.length; i < length; i++) {
        var key = arr[i];

        if (!name) {
            delete self.cache[key];
            continue;
        }

        if (key.substring(0, name.length) !== name)
            continue;
        delete self.cache[key];
    }

    return self;
};

/**
 * Refresh component instances
 * @return {ComponentManager}
 */
ComponentManager.prototype.refresh = function() {

    var self = this;
    self.components = [];

    $(COM_ATTR).each(function() {
        var component = $(this).data(COM_ATTR);
        if (!component || !component.element)
            return;
        self.components.push(component);
    });

    return self;
};

ComponentManager.prototype.ready = function() {
    var self = this;
    if (self.init.length === 0)

    return self;
};

/**
 * Get value from a model
 * @param {String} path
 * @return {Object}
 */
ComponentManager.prototype.get = function(path) {

    if (path === undefined)
        return;

    var obj = window;

    for (var i = 0, path = path.split('.'), len = path.length; i < len; i++) {
        if (!obj)
            return;

        var p = path[i];
        if (p.substring(p.length - 1, p.length) === ']') {
            var beg = p.lastIndexOf('[');
            index = parseInt(p.substring(beg + 1, p.length - 1));
            p = p.substring(0, beg);
            obj = obj[p][index];
        } else
            obj = obj[p];
    }

    return obj;
};

/**
 * Set value to a model
 * @param {String} path
 * @param {Object} value
 */
ComponentManager.prototype.set = function(path, value) {

    var self = this;

    if (!path)
        return self;

    var obj = window;
    var isFn = typeof(value) === 'function';

    for (var i = 0, path = path.split('.'), len = path.length; i < len; i++) {

        var p = path[i];
        var index = -1;

        if (p.substring(p.length - 1, p.length) === ']') {
            var beg = p.lastIndexOf('[');
            index = parseInt(p.substring(beg + 1, p.length - 1));
            p = p.substring(0, beg);
        }

        if (!obj) {
            return;
            /*
            if (index === -1)
                obj[p] = {};
            else {
                obj[p] = [];
                obj[p][index] = {};
            }
            return;*/
        }

        if (len - 1 !== i) {
            if (index === -1)
                obj = obj[p];
            else
                obj = obj[p][index];
            continue;
        }

        if (index === -1)
            obj[p] = isFn ? value(obj[p]) : value;
        else
            obj[p][index] = isFn ? value(obj[p][index]) : value;
    }

    return self;
};

/**
 * Event cleaner
 * @return {ComponentManager}
 */
ComponentManager.prototype.cleaner = function() {

    var self = this;
    var aks = Object.keys(self.events);
    var is = false;

    for (var a = 0, al = aks.length; a < al; a++) {

        var ak = aks[a];

        if (!self.events[ak])
            continue;

        var bks = Object.keys(self.events[ak]);

        for (var b = 0, bl = bks.length; b < bl; b++) {

            var bk = bks[b];
            var arr = self.events[ak][bk];

            if (!arr)
                continue;

            var index = 0;

            while (true) {

                var item = arr[index++];
                if (item === undefined)
                    break;

                if (item.context === undefined)
                    continue;

                if (item.context === null || !item.context.element || item.context.element.parent().length !== 0)
                    continue;

                item.context = null;
                self.events[ak][bk].splice(index - 1, 1);

                if (self.events[ak][bk].length === 0) {
                    delete self.events[ak][bk];
                    if (Object.keys(self.events[ak]).length === 0)
                        delete self.events[ak];
                }

                index -= 2;
                is = true;
            }

        }
    }

    if (!is)
        return self;

    self.refresh();
    return self;
};

/**
 * Default component
 */
COMPONENT('', function() {
    var type = this.element.get(0).tagName;
    if (type === 'INPUT' || type === 'SELECT' || type === 'TEXTAREA' || this.element.find(COM_DATA_BIND_SELECTOR).length > 0)
        return;
    this.getter = null;
    this.setter = function(value) {
        value = this.formatter(value, true);
        this.element.html(value);
    };
});

setInterval(function() {
    $cmanager.cleaner();
}, 1000 * 60);

$.components();
$(document).ready(function() {
    $.components();
    setTimeout(function() {
        $cmanager.cleaner();
    }, 3000);
});