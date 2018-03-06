import Answer from './Answer.html';

var AnswerComponent = new Answer({
	methods: {
		sumbitAnswer() {
			console.log('Answered');
		}
	}
});

export default AnswerComponent;
