# ~*~ coding: utf-8 ~*~
from __future__ import absolute_import

from jms.tasks import MemoryQueue, Task
from .service import service

command_queue = MemoryQueue()
record_queue = MemoryQueue()

command_task = Task(command_queue, service.send_command_log,
                    threads_num=4, batch_count=10)
record_task = Task(record_queue, service.send_record_log,
                   threads_num=4, batch_count=10)

