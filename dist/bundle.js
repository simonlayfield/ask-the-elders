(function () {
'use strict';

function noop() {}

function assign(target) {
	var k,
		source,
		i = 1,
		len = arguments.length;
	for (; i < len; i++) {
		source = arguments[i];
		for (k in source) target[k] = source[k];
	}

	return target;
}

function appendNode(node, target) {
	target.appendChild(node);
}

function insertNode(node, target, anchor) {
	target.insertBefore(node, anchor);
}

function detachNode(node) {
	node.parentNode.removeChild(node);
}

function destroyEach(iterations) {
	for (var i = 0; i < iterations.length; i += 1) {
		if (iterations[i]) iterations[i].d();
	}
}

function createElement(name) {
	return document.createElement(name);
}

function createText(data) {
	return document.createTextNode(data);
}

function createComment() {
	return document.createComment('');
}

function addListener(node, event, handler) {
	node.addEventListener(event, handler, false);
}

function removeListener(node, event, handler) {
	node.removeEventListener(event, handler, false);
}

function setAttribute(node, attribute, value) {
	node.setAttribute(attribute, value);
}

function linear(t) {
	return t;
}

function generateRule(
	a,
	b,
	delta,
	duration,
	ease,
	fn
) {
	var keyframes = '{\n';

	for (var p = 0; p <= 1; p += 16.666 / duration) {
		var t = a + delta * ease(p);
		keyframes += p * 100 + '%{' + fn(t) + '}\n';
	}

	return keyframes + '100% {' + fn(b) + '}\n}';
}

// https://github.com/darkskyapp/string-hash/blob/master/index.js
function hash(str) {
	var hash = 5381;
	var i = str.length;

	while (i--) hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
	return hash >>> 0;
}

function wrapTransition(component, node, fn, params, intro, outgroup) {
	var obj = fn(node, params);
	var duration = obj.duration || 300;
	var ease = obj.easing || linear;
	var cssText;

	// TODO share <style> tag between all transitions?
	if (obj.css && !transitionManager.stylesheet) {
		var style = createElement('style');
		document.head.appendChild(style);
		transitionManager.stylesheet = style.sheet;
	}

	if (intro) {
		if (obj.css && obj.delay) {
			cssText = node.style.cssText;
			node.style.cssText += obj.css(0);
		}

		if (obj.tick) obj.tick(0);
	}

	return {
		t: intro ? 0 : 1,
		running: false,
		program: null,
		pending: null,
		run: function(intro, callback) {
			var program = {
				start: window.performance.now() + (obj.delay || 0),
				intro: intro,
				callback: callback
			};

			if (obj.delay) {
				this.pending = program;
			} else {
				this.start(program);
			}

			if (!this.running) {
				this.running = true;
				transitionManager.add(this);
			}
		},
		start: function(program) {
			component.fire(program.intro ? 'intro.start' : 'outro.start', { node: node });

			program.a = this.t;
			program.b = program.intro ? 1 : 0;
			program.delta = program.b - program.a;
			program.duration = duration * Math.abs(program.b - program.a);
			program.end = program.start + program.duration;

			if (obj.css) {
				if (obj.delay) node.style.cssText = cssText;

				program.rule = generateRule(
					program.a,
					program.b,
					program.delta,
					program.duration,
					ease,
					obj.css
				);

				transitionManager.addRule(program.rule, program.name = '__svelte_' + hash(program.rule));

				node.style.animation = (node.style.animation || '')
					.split(', ')
					.filter(function(anim) {
						// when introing, discard old animations if there are any
						return anim && (program.delta < 0 || !/__svelte/.test(anim));
					})
					.concat(program.name + ' ' + duration + 'ms linear 1 forwards')
					.join(', ');
			}

			this.program = program;
			this.pending = null;
		},
		update: function(now) {
			var program = this.program;
			if (!program) return;

			var p = now - program.start;
			this.t = program.a + program.delta * ease(p / program.duration);
			if (obj.tick) obj.tick(this.t);
		},
		done: function() {
			var program = this.program;
			this.t = program.b;
			if (obj.tick) obj.tick(this.t);
			if (obj.css) transitionManager.deleteRule(node, program.name);
			program.callback();
			program = null;
			this.running = !!this.pending;
		},
		abort: function() {
			if (obj.tick) obj.tick(1);
			if (obj.css) transitionManager.deleteRule(node, this.program.name);
			this.program = this.pending = null;
			this.running = false;
		}
	};
}

var transitionManager = {
	running: false,
	transitions: [],
	bound: null,
	stylesheet: null,
	activeRules: {},

	add: function(transition) {
		this.transitions.push(transition);

		if (!this.running) {
			this.running = true;
			requestAnimationFrame(this.bound || (this.bound = this.next.bind(this)));
		}
	},

	addRule: function(rule, name) {
		if (!this.activeRules[name]) {
			this.activeRules[name] = true;
			this.stylesheet.insertRule('@keyframes ' + name + ' ' + rule, this.stylesheet.cssRules.length);
		}
	},

	next: function() {
		this.running = false;

		var now = window.performance.now();
		var i = this.transitions.length;

		while (i--) {
			var transition = this.transitions[i];

			if (transition.program && now >= transition.program.end) {
				transition.done();
			}

			if (transition.pending && now >= transition.pending.start) {
				transition.start(transition.pending);
			}

			if (transition.running) {
				transition.update(now);
				this.running = true;
			} else if (!transition.pending) {
				this.transitions.splice(i, 1);
			}
		}

		if (this.running) {
			requestAnimationFrame(this.bound);
		} else if (this.stylesheet) {
			var i = this.stylesheet.cssRules.length;
			while (i--) this.stylesheet.deleteRule(i);
			this.activeRules = {};
		}
	},

	deleteRule: function(node, name) {
		node.style.animation = node.style.animation
			.split(', ')
			.filter(function(anim) {
				return anim.slice(0, name.length) !== name;
			})
			.join(', ');
	}
};

function blankObject() {
	return Object.create(null);
}

function destroy(detach) {
	this.destroy = noop;
	this.fire('destroy');
	this.set = this.get = noop;

	if (detach !== false) this._fragment.u();
	this._fragment.d();
	this._fragment = this._state = null;
}

function differs(a, b) {
	return a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}

function dispatchObservers(component, group, changed, newState, oldState) {
	for (var key in group) {
		if (!changed[key]) continue;

		var newValue = newState[key];
		var oldValue = oldState[key];

		var callbacks = group[key];
		if (!callbacks) continue;

		for (var i = 0; i < callbacks.length; i += 1) {
			var callback = callbacks[i];
			if (callback.__calling) continue;

			callback.__calling = true;
			callback.call(component, newValue, oldValue);
			callback.__calling = false;
		}
	}
}

function fire(eventName, data) {
	var handlers =
		eventName in this._handlers && this._handlers[eventName].slice();
	if (!handlers) return;

	for (var i = 0; i < handlers.length; i += 1) {
		handlers[i].call(this, data);
	}
}

function get(key) {
	return key ? this._state[key] : this._state;
}

function init(component, options) {
	component._observers = { pre: blankObject(), post: blankObject() };
	component._handlers = blankObject();
	component._bind = options._bind;

	component.options = options;
	component.root = options.root || component;
	component.store = component.root.store || options.store;
}

function observe(key, callback, options) {
	var group = options && options.defer
		? this._observers.post
		: this._observers.pre;

	(group[key] || (group[key] = [])).push(callback);

	if (!options || options.init !== false) {
		callback.__calling = true;
		callback.call(this, this._state[key]);
		callback.__calling = false;
	}

	return {
		cancel: function() {
			var index = group[key].indexOf(callback);
			if (~index) group[key].splice(index, 1);
		}
	};
}

function on(eventName, handler) {
	if (eventName === 'teardown') return this.on('destroy', handler);

	var handlers = this._handlers[eventName] || (this._handlers[eventName] = []);
	handlers.push(handler);

	return {
		cancel: function() {
			var index = handlers.indexOf(handler);
			if (~index) handlers.splice(index, 1);
		}
	};
}

function set(newState) {
	this._set(assign({}, newState));
	if (this.root._lock) return;
	this.root._lock = true;
	callAll(this.root._beforecreate);
	callAll(this.root._oncreate);
	callAll(this.root._aftercreate);
	this.root._lock = false;
}

function _set(newState) {
	var oldState = this._state,
		changed = {},
		dirty = false;

	for (var key in newState) {
		if (differs(newState[key], oldState[key])) changed[key] = dirty = true;
	}
	if (!dirty) return;

	this._state = assign({}, oldState, newState);
	this._recompute(changed, this._state);
	if (this._bind) this._bind(changed, this._state);

	if (this._fragment) {
		dispatchObservers(this, this._observers.pre, changed, this._state, oldState);
		this._fragment.p(changed, this._state);
		dispatchObservers(this, this._observers.post, changed, this._state, oldState);
	}
}

function callAll(fns) {
	while (fns && fns.length) fns.shift()();
}

function _mount(target, anchor) {
	this._fragment.m(target, anchor);
}

function _unmount() {
	if (this._fragment) this._fragment.u();
}

var proto = {
	destroy: destroy,
	get: get,
	fire: fire,
	observe: observe,
	on: on,
	set: set,
	teardown: destroy,
	_recompute: noop,
	_set: _set,
	_mount: _mount,
	_unmount: _unmount
};

/* src/components/Answer.html generated by Svelte v1.54.1 */
function data() {
	return {

	}
}

var methods = {
	handleAnswer(answer) {
		console.log('fired!');
	}
};

function encapsulateStyles(node) {
	setAttribute(node, "svelte-1479972836", "");
}

function add_css() {
	var style = createElement("style");
	style.id = 'svelte-1479972836-style';
	style.textContent = "[svelte-1479972836].answer,[svelte-1479972836] .answer{width:100%;display:flex;flex-direction:column;align-items:center;margin:0 1rem;border:1px solid #aaa;background:#fff;padding:1rem;margin-top:.5rem;margin-bottom:.5rem}[svelte-1479972836].answer.-light,[svelte-1479972836] .answer.-light{border:none}";
	appendNode(style, document.head);
}

function create_main_fragment(state, component) {
	var button, text, button_class_value;

	function click_handler(event) {
		var state = component.get();
		component.fire('handleAnswer', {answer: state.answer});
	}

	return {
		c: function create() {
			button = createElement("button");
			text = createText(state.answer);
			this.h();
		},

		h: function hydrate() {
			encapsulateStyles(button);
			button.className = button_class_value = "answer " + (state.questionIndex > 1 ? '-light' : '');
			button.type = "button";
			button.name = "button";
			addListener(button, "click", click_handler);
		},

		m: function mount(target, anchor) {
			insertNode(button, target, anchor);
			appendNode(text, button);
		},

		p: function update(changed, state) {
			if (changed.answer) {
				text.data = state.answer;
			}

			if ((changed.questionIndex) && button_class_value !== (button_class_value = "answer " + (state.questionIndex > 1 ? '-light' : ''))) {
				button.className = button_class_value;
			}
		},

		u: function unmount() {
			detachNode(button);
		},

		d: function destroy$$1() {
			removeListener(button, "click", click_handler);
		}
	};
}

function Answer(options) {
	init(this, options);
	this._state = assign(data(), options.data);

	if (!document.getElementById("svelte-1479972836-style")) add_css();

	this._fragment = create_main_fragment(this._state, this);

	if (options.target) {
		this._fragment.c();
		this._fragment.m(options.target, options.anchor || null);
	}
}

assign(Answer.prototype, methods, proto);

var AnswerComponent = new Answer({
	methods: {
		sumbitAnswer() {
			console.log('Answered');
		}
	}
});

var arrayNotationPattern = /\[\s*(\d+)\s*\]/g;
function makeArrayMethod(name) {
    return function (keypath) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        var parts = keypath.replace(arrayNotationPattern, '.$1').split('.');
        var key = parts.shift();
        var value = this.get(key);
        var array = value;
        while (parts.length)
            array = array[parts.shift()];
        var result = array[name].apply(array, args);
        this.set((_a = {}, _a[key] = value, _a));
        return result;
        var _a;
    };
}
var push = makeArrayMethod('push');
var splice = makeArrayMethod('splice');

function fade ( node, ref ) {
	var delay = ref.delay; if ( delay === void 0 ) delay = 0;
	var duration = ref.duration; if ( duration === void 0 ) duration = 400;

	var o = +getComputedStyle( node ).opacity;

	return {
		delay: delay,
		duration: duration,
		css: function (t) { return ("opacity: " + (t * o)); }
	};
}

/* src/components/App.html generated by Svelte v1.54.1 */
function data$1() {
	return {
		reverseOrder: false,
		activeQuestion: 0,
		submittedAnswers: [],
		questions: [{
				text: "How many players?",
				answers: [{
						text: "2"
					},
					{
						text: "3"
					},
					{
						text: "4"
					},
					{
						text: "5"
					},
					{
						text: "6"
					}
				]
			},
			{
				text: "What setting?",
				answers: [{
						text: "Fantasy"
					},
					{
						text: "Sci-Fi"
					},
					{
						text: "Family"
					},
					{
						text: "Adventure"
					},
					{
						text: "Ocean & Marine"
					},
					{
						text: "Medieval"
					}
				]
			},
			{
				text: "How long?",
				answers: [{
						text: "15 - 30mins"
					},
					{
						text: "30mins - 1hr"
					},
					{
						text: "1hr - 2hrs"
					}
				]
			}
		]
	}
}

var methods$1 = {
	push,
	splice,
	submitAnswer(answer, answerIndex) {

		this.set({reverseOrder: false});

		if (this.get('activeQuestion') === 1) {
			document.querySelector('.bg').style.backgroundImage = `url(dist/img/${answer}.jpg)`;
			document.querySelector('.bg').style.opacity = 1;
		}

		let questionData = this.get('questions'),
			activeQuestion = this.get('activeQuestion');

		questionData[activeQuestion].answers[answerIndex].selected = true;

		this.set({questions: questionData});

		this.set({
			activeQuestion: this.get('activeQuestion') + 1
		});
		this.push('submittedAnswers', answer);
	},
	goBack() {
		this.set({reverseOrder: true});
		this.set({activeQuestion: this.get('activeQuestion')-1});
		if (this.get('activeQuestion') === 1) {
			document.querySelector('.bg').style.opacity = 0;
		}

	}
};

function encapsulateStyles$1(node) {
	setAttribute(node, "svelte-2246800526", "");
}

function add_css$1() {
	var style = createElement("style");
	style.id = 'svelte-2246800526-style';
	style.textContent = "[svelte-2246800526].back,[svelte-2246800526] .back{border:1px solid #000;color:#000;background:transparent;visibility:hidden}[svelte-2246800526].back.-light,[svelte-2246800526] .back.-light{border:1px solid #fff;color:#fff}[svelte-2246800526].back.-visible,[svelte-2246800526] .back.-visible{visibility:visible}[svelte-2246800526].questions,[svelte-2246800526] .questions{display:flex;flex-direction:column}[svelte-2246800526].questions.-reverse,[svelte-2246800526] .questions.-reverse{flex-direction:column-reverse}[svelte-2246800526].question,[svelte-2246800526] .question{display:flex;flex-direction:column;align-items:center}[svelte-2246800526].question.-light,[svelte-2246800526] .question.-light{color:#fff}[svelte-2246800526].question.active,[svelte-2246800526] .question.active{}[svelte-2246800526].answers,[svelte-2246800526] .answers{display:flex;flex-wrap:wrap}[svelte-2246800526].results,[svelte-2246800526] .results{margin-top:3rem;text-align:center}[svelte-2246800526].results.-light,[svelte-2246800526] .results.-light{color:#fff}";
	appendNode(style, document.head);
}

function create_main_fragment$1(state, component) {
	var button, button_class_value, text_1, div, div_class_value;

	function click_handler(event) {
		component.goBack();
	}

	var questions = state.questions;

	var each_blocks = [];

	for (var i = 0; i < questions.length; i += 1) {
		each_blocks[i] = create_each_block(state, questions, questions[i], i, component);
	}

	return {
		c: function create() {
			button = createElement("button");
			button.textContent = "Back";
			text_1 = createText("\n");
			div = createElement("div");

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}
			this.h();
		},

		h: function hydrate() {
			encapsulateStyles$1(button);
			button.className = button_class_value = "back " + (state.activeQuestion > 1 ? '-light' : '') + " " + (state.activeQuestion > 0 ? '-visible' : '');
			button.type = "button";
			button.name = "button";
			addListener(button, "click", click_handler);
			encapsulateStyles$1(div);
			div.className = div_class_value = "questions " + (state.reverseOrder ? '-reverse' : '');
		},

		m: function mount(target, anchor) {
			insertNode(button, target, anchor);
			insertNode(text_1, target, anchor);
			insertNode(div, target, anchor);

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(div, null);
			}
		},

		p: function update(changed, state) {
			if ((changed.activeQuestion) && button_class_value !== (button_class_value = "back " + (state.activeQuestion > 1 ? '-light' : '') + " " + (state.activeQuestion > 0 ? '-visible' : ''))) {
				button.className = button_class_value;
			}

			var questions = state.questions;

			if (changed.activeQuestion || changed.questions || changed.index) {
				for (var i = 0; i < questions.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].p(changed, state, questions, questions[i], i);
					} else {
						each_blocks[i] = create_each_block(state, questions, questions[i], i, component);
						each_blocks[i].c();
						each_blocks[i].m(div, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].u();
					each_blocks[i].d();
				}
				each_blocks.length = questions.length;
			}

			if ((changed.reverseOrder) && div_class_value !== (div_class_value = "questions " + (state.reverseOrder ? '-reverse' : ''))) {
				div.className = div_class_value;
			}
		},

		u: function unmount() {
			detachNode(button);
			detachNode(text_1);
			detachNode(div);

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].u();
			}
		},

		d: function destroy$$1() {
			removeListener(button, "click", click_handler);

			destroyEach(each_blocks);
		}
	};
}

// (4:1) {{#each questions as question, questionIndex}}
function create_each_block(state, questions, question, questionIndex, component) {
	var if_block_anchor;

	var if_block = (state.activeQuestion == questionIndex) && create_if_block(state, questions, question, questionIndex, component);

	return {
		c: function create() {
			if (if_block) if_block.c();
			if_block_anchor = createComment();
		},

		m: function mount(target, anchor) {
			if (if_block) if_block.i(target, anchor);
			insertNode(if_block_anchor, target, anchor);
		},

		p: function update(changed, state, questions, question, questionIndex) {
			if (state.activeQuestion == questionIndex) {
				if (if_block) {
					if_block.p(changed, state, questions, question, questionIndex);
				} else {
					if_block = create_if_block(state, questions, question, questionIndex, component);
					if (if_block) if_block.c();
				}

				if_block.i(if_block_anchor.parentNode, if_block_anchor);
			} else if (if_block) {
				if_block.o(function() {
					if_block.u();
					if_block.d();
					if_block = null;
				});
			}
		},

		u: function unmount() {
			if (if_block) if_block.u();
			detachNode(if_block_anchor);
		},

		d: function destroy$$1() {
			if (if_block) if_block.d();
		}
	};
}

// (9:5) {{#each question.answers as answer, answerIndex}}
function create_each_block_1(state, questions, question, questionIndex, answers, answer, answerIndex, component) {

	var answer_1 = new Answer({
		root: component.root,
		data: {
			selected: answer.selected,
			answer: answer.text,
			answerIndex: state.index,
			questionIndex: questionIndex
		}
	});

	answer_1.on("handleAnswer", function(event) {
		var answers = answer_1_context.answers, answerIndex = answer_1_context.answerIndex, answer = answers[answerIndex];

		component.submitAnswer(event.answer, answerIndex);
	});

	var answer_1_context = {
		answers: answers,
		answerIndex: answerIndex
	};

	return {
		c: function create() {
			answer_1._fragment.c();
		},

		m: function mount(target, anchor) {
			answer_1._mount(target, anchor);
		},

		p: function update(changed, state, questions, question, questionIndex, answers, answer, answerIndex) {
			var answer_1_changes = {};
			if (changed.questions) answer_1_changes.selected = answer.selected;
			if (changed.questions) answer_1_changes.answer = answer.text;
			if (changed.index) answer_1_changes.answerIndex = state.index;
			answer_1_changes.questionIndex = questionIndex;
			answer_1._set(answer_1_changes);

			answer_1_context.answers = answers;
			answer_1_context.answerIndex = answerIndex;
		},

		u: function unmount() {
			answer_1._unmount();
		},

		d: function destroy$$1() {
			answer_1.destroy(false);
		}
	};
}

// (5:2) {{#if activeQuestion == questionIndex}}
function create_if_block(state, questions, question, questionIndex, component) {
	var div, h3, text_value = question.text, text, text_1, div_1, div_class_value, div_intro, div_outro, introing, outroing;

	var answers = question.answers;

	var each_blocks = [];

	for (var i = 0; i < answers.length; i += 1) {
		each_blocks[i] = create_each_block_1(state, questions, question, questionIndex, answers, answers[i], i, component);
	}

	return {
		c: function create() {
			div = createElement("div");
			h3 = createElement("h3");
			text = createText(text_value);
			text_1 = createText("\n\t\t\t\t");
			div_1 = createElement("div");

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}
			this.h();
		},

		h: function hydrate() {
			div_1.className = "answers";
			div.className = div_class_value = "question " + (questionIndex > 1 ? '-light' : '');
		},

		m: function mount(target, anchor) {
			insertNode(div, target, anchor);
			appendNode(h3, div);
			appendNode(text, h3);
			appendNode(text_1, div);
			appendNode(div_1, div);

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].m(div_1, null);
			}
		},

		p: function update(changed, state, questions, question, questionIndex) {
			if ((outroing || changed.questions) && text_value !== (text_value = question.text)) {
				text.data = text_value;
			}

			var answers = question.answers;

			if (changed.questions || changed.index) {
				for (var i = 0; i < answers.length; i += 1) {
					if (each_blocks[i]) {
						each_blocks[i].p(changed, state, questions, question, questionIndex, answers, answers[i], i);
					} else {
						each_blocks[i] = create_each_block_1(state, questions, question, questionIndex, answers, answers[i], i, component);
						each_blocks[i].c();
						each_blocks[i].m(div_1, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].u();
					each_blocks[i].d();
				}
				each_blocks.length = answers.length;
			}
		},

		i: function intro(target, anchor) {
			if (introing) return;
			introing = true;
			outroing = false;

			if (div_intro) div_intro.abort();
			if (div_outro) div_outro.abort();

			component.root._aftercreate.push(function() {
				div_intro = wrapTransition(component, div, fade, {delay: 1000, duration: 1000}, true, null);
				div_intro.run(true, function() {
					component.fire("intro.end", { node: div });
				});
			});

			this.m(target, anchor);
		},

		o: function outro(outrocallback) {
			if (outroing) return;
			outroing = true;
			introing = false;

			var outros = 1;

			div_outro = wrapTransition(component, div, fade, {duration: 1000}, false, null);
			div_outro.run(false, function() {
				component.fire("outro.end", { node: div });
				if (--outros === 0) outrocallback();
			});
		},

		u: function unmount() {
			detachNode(div);

			for (var i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].u();
			}
		},

		d: function destroy$$1() {
			destroyEach(each_blocks);
		}
	};
}

function App(options) {
	init(this, options);
	this._state = assign(data$1(), options.data);

	if (!document.getElementById("svelte-2246800526-style")) add_css$1();

	if (!options.root) {
		this._oncreate = [];
		this._beforecreate = [];
		this._aftercreate = [];
	}

	this._fragment = create_main_fragment$1(this._state, this);

	if (options.target) {
		this._fragment.c();
		this._fragment.m(options.target, options.anchor || null);

		this._lock = true;
		callAll(this._beforecreate);
		callAll(this._oncreate);
		callAll(this._aftercreate);
		this._lock = false;
	}
}

assign(App.prototype, methods$1, proto);

var AppComponent = new App({
	target: document.querySelector('#app')
});

}());
