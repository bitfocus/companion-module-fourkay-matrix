// Fourkay 8x8 HDMI Matrix Switch

let tcp = require('../../tcp');
let instance_skel = require('../../instance_skel');

var debug;
var log;

class instance extends instance_skel {
	constructor(system, id, config) {
		super(system, id, config)

		this.pollMixerTimer = undefined
		this.selectedInput = 0
		this.outputSet = [0,1,2,3,4,5,6,7]
	}

	destroy() {
		if (this.socket !== undefined) {
			this.socket.destroy()
		}

		if (this.pollMixerTimer !== undefined) {
			clearInterval(this.pollMixerTimer)
			delete this.pollMixerTimer
		}

		debug('destroy', this.id)
	}

	init() {
		debug = this.debug
		log = this.log
		this.updateConfig(this.config)
	}

	updateConfig(config) {
		// polling is running and polling has been de-selected by config change
		if (this.pollMixerTimer !== undefined) {
			clearInterval(this.pollMixerTimer)
			delete this.pollMixerTimer
		}
		this.config = config

		this.config.polling_interval =
		this.config.polling_interval !== undefined
		  ? this.config.polling_interval
		  : 500;


		this.initActions()
		this.initFeedbacks()
		this.init_tcp()
		this.initPolling()
		this.initPresets();
	}

	init_tcp() {

		if (this.socket !== undefined) {
			this.socket.destroy()
			delete this.socket
		}

		if (this.config.port === undefined) {
			this.config.port = 22
		}

		if (this.config.host) {
			this.socket = new tcp(this.config.host, this.config.port)

			this.socket.on('status_change', (status, message) => {
				this.status(status, message)
			})

			this.socket.on('error', (err) => {
				debug('Network error', err)
				this.log('error', 'Network error: ' + err.message)
			})

			this.socket.on('connect', () => {
				debug('Connected')
			})

			this.socket.on('data', (receivebuffer) => {
				this.processResponse(receivebuffer)		
			})
		}
	}

	processResponse(receivebuffer) {
		let allresponses = receivebuffer.toString('utf8').replace(/[^\ds]/g, '').split('s')
		// should be 2 digit responses of input to output mappings
		for (let response of allresponses) {
			if (response.length > 0) {
				if (response.length != 2) {
					this.log('error, unexpected response: ' + response)
				} else {
					let input = response.charAt(0)
					let output = response.charAt(1)
					this.outputSet[output] = input
					this.checkFeedbacks()
				}	
			}
		}			
	}

	sendCommmand(cmd) {
		if (cmd !== undefined) {
			if (this.socket !== undefined && this.socket.connected) {
				this.socket.send(cmd)
			} else {
				debug('Socket not connected :(')
			}
		}
	}

	initPolling() {
		if (this.pollMixerTimer === undefined) {
			this.pollMixerTimer = setInterval(() => {
				this.sendCommmand('bc ')
			}, this.config.poll_interval)
		}
	}

	config_fields() {
		return [
			{
				type: 'text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: 'This module will connect to a Fourkay 8x8 HDMI Matrix Switche.',
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'IP Address',
				width: 6,
				default: '192.168.0.3',
				regex: this.REGEX_IP,
			},
			{
			type: 'textinput',
			id: 'port',
			label: 'IP Port',
			width: 6,
			default: '22',
			regex: this.REGEX_PORT,
			},
			{
				type: 'number',
				id: 'poll_interval',
				label: 'Polling Interval (ms)',
				min: 300,
				max: 30000,
				default: 500,
				width: 8,
			},
		]
	}

	initActions() {
		let actions = {
			select_input: {
				label: 'Select input',
				options: [
					{
						type: 'number',
						label: 'Input',
						id: 'input',
						default: 1,
						min: 1,
						max: 8,
						required: true,
					},
				],
			},
			switch_output: {
				label: 'Select output',
				options: [
					{
						type: 'number',
						label: 'Output',
						id: 'output',
						default: 1,
						min: 1,
						max: 8,
						required: true,
					},
				],
			},
			all: {
				label: 'All outputs to selected channel',
			},
			test: {
				label: 'test stringl',
				options: [
					{
						type: 'textinput',
						label: 'test',
						id: 'test',
						default: 's11',
					},
				],
			},
		}
		this.setActions(actions)
	}

	action(action) {
		let options = action.options
		switch (action.action) {
			case 'select_input':
				this.selectedInput = options.input-1
				break
			case 'switch_output':
				this.sendCommmand('cir ' + this.selectedInput.toString() + (options.output-1).toString())
				break
			case 'all':
				for (let i = 0; i <= 7; i++) {
					this.sendCommmand('cir ' + this.selectedInput.toString() + i)
				}
				break
			case 'test':
				this.processResponse(options.test)
				break
		}
		this.checkFeedbacks()
	}

	initFeedbacks() {
		let feedbacks = {}

		feedbacks['selected'] = {
			type: 'boolean',
			label: 'Status for input',
			description: 'Show feedback selected input',
			options: [
				{
					type: 'number',
					label: 'Input',
					id: 'input',
					default: 1,
					min: 1,
					max: 8,
					required: true,
				},
			],
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(255, 0, 0),
			},
			callback: (feedback, bank) => {
				let opt = feedback.options
				if (this.selectedInput == opt.input-1) {
					return true
				} else {
					return false
				}
			},
		}
		feedbacks['output'] = {
			type: 'boolean',
			label: 'Status for output',
			description: 'Show feedback selected output',
			options: [
				{
					type: 'number',
					label: 'Output',
					id: 'output',
					default: 1,
					min: 1,
					max: 8,
					required: true,
				},
			],
			style: {
				color: this.rgb(0, 0, 0),
				bgcolor: this.rgb(0, 255, 0),
			},
			callback: (feedback, bank) => {
				let opt = feedback.options
				if (this.outputSet[opt.output-1] == this.selectedInput) {
					return true
				} else {
					return false
				}
			},
		}
		this.setFeedbackDefinitions(feedbacks)
	}
	initPresets() {
		let presets = []

		presets.push({
			category: 'Matrix',
			label: 'Select',
			bank: {
				style: 'text',
				text: 'Select',
				size: '18',
				color: this.rgb(255, 255, 255),
				bgcolor: this.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'select_input',
					options: {
						id: 1,
					},
				},
			],
			feedbacks: [
				{
					type: 'selected',
					options: {
						id: 1,
					},
					style: {
						color: this.rgb(0, 0, 0),
						bgcolor: this.rgb(255, 0, 0),
					},
				},
			],
		})
		presets.push({
			category: 'Matrix',
			label: 'Switch',
			bank: {
				style: 'text',
				text: 'Switch',
				size: '18',
				color: this.rgb(255, 255, 255),
				bgcolor: this.rgb(0, 0, 0),
			},
			actions: [
				{
					action: 'switch_output',
					options: {
						id: 1,
					},
				},
			],
			feedbacks: [
				{
					type: 'output',
					options: {
						id: 1,
					},
					style: {
						color: this.rgb(0, 0, 0),
						bgcolor: this.rgb(0, 255, 0),
					},
				},
			],
		})
		this.setPresetDefinitions(presets)
	}
}
exports = module.exports = instance;